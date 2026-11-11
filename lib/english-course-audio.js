'use strict';

const DEFAULT_HOST = 'https://translate.google.com';
const FALLBACK_HOST = 'https://translate.google.com.cn';
const MAX_TTS_CHARS = 180;
const DEFAULT_TIMEOUT_MS = 12000;

function cleanEnglishLine(value) {
  let line = String(value || '').trim();
  if (!line) return '';

  // د ګډو پښتو/انګلیسي کرښو په صورت کې یوازې د کولن مخکې انګلیسي برخه ساتو.
  if (/[\u0600-\u06FF]/u.test(line)) {
    const separator = line.search(/[:：]/u);
    line = separator > 0 ? line.slice(0, separator).trim() : '';
  }

  line = line.replace(/^[AB]\s*[:：]\s*/iu, '');
  line = line.replace(/\s*\/\s*/gu, ' or ');
  line = line.replace(/\s*[–—]\s*/gu, ', ');
  line = line.replace(/\s*,\s*,+/gu, ', ');
  line = line.replace(/[“”]/gu, '"');
  line = line.replace(/^([A-Z])\s+\1$/iu, '$1');
  line = line.replace(/\s+/gu, ' ').trim();
  line = line.replace(/^[,.;:!? ]+|[,;: ]+$/gu, '');
  return line;
}

function splitLongPhrase(phrase, maxChars) {
  const words = String(phrase || '').split(/\s+/u).filter(Boolean);
  const result = [];
  let current = '';

  for (const word of words) {
    if (word.length > maxChars) {
      if (current) result.push(current);
      result.push(word.slice(0, maxChars));
      current = word.slice(maxChars);
      continue;
    }

    const candidate = current ? current + ' ' + word : word;
    if (candidate.length > maxChars) {
      if (current) result.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) result.push(current);
  return result;
}

function packSpeechSection(label, values, maxChars = MAX_TTS_CHARS) {
  const lines = (Array.isArray(values) ? values : [])
    .map(cleanEnglishLine)
    .filter(Boolean);
  if (!lines.length) return [];

  const chunks = [];
  let current = label + '.';

  for (const line of lines) {
    const sentence = /[.!?]$/u.test(line) ? line : line + '.';
    const candidate = current ? current + ' ' + sentence : sentence;

    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current && current !== label + '.') chunks.push(current);
    current = '';

    for (const piece of splitLongPhrase(sentence, maxChars)) {
      if (!current) {
        current = piece;
      } else if ((current + ' ' + piece).length <= maxChars) {
        current += ' ' + piece;
      } else {
        chunks.push(current);
        current = piece;
      }
    }
  }

  if (current && current !== label + '.') chunks.push(current);
  return chunks.map((text) => ({ label, text }));
}

function buildLessonSpeechChunks(lesson, maxChars = MAX_TTS_CHARS) {
  if (!lesson || typeof lesson !== 'object') return [];

  const vocabulary = Array.isArray(lesson.vocab)
    ? lesson.vocab.map((item) => Array.isArray(item) ? item[0] : '')
    : [];

  return [
    ...packSpeechSection('Vocabulary', vocabulary, maxChars),
    ...packSpeechSection('Examples', lesson.examples, maxChars),
    ...packSpeechSection('Dialogue', lesson.dialogue, maxChars),
  ];
}

async function requestGoogleTtsAudio(text, options = {}) {
  const lang = options.lang || 'en';
  const host = String(options.host || DEFAULT_HOST).replace(/\/+$/u, '');
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    throw new Error('د Node.js د fetch خدمت موجود نه دی.');
  }
  if (!text || String(text).length > 200) {
    throw new RangeError('د غږیزې برخې متن باید له ۲۰۰ تورو کم وي.');
  }

  const requestPayload = [
    [[
      'jQ1olc',
      JSON.stringify([String(text), lang, options.slow === false ? null : true, 'null']),
      null,
      'generic',
    ]],
  ];

  const response = await fetchImpl(host + '/_/TranslateWebserverUi/data/batchexecute', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'user-agent': 'Mozilla/5.0 (compatible; MaloomatAI/1.0)',
      origin: host,
      referer: host + '/',
    },
    body: 'f.req=' + encodeURIComponent(JSON.stringify(requestPayload)),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error('د غږیز خدمت ځواب: HTTP ' + response.status);
  }

  const responseText = await response.text();
  const jsonStart = responseText.indexOf('[');
  if (jsonStart < 0) throw new Error('د غږیز خدمت ځواب د لوستلو وړ نه دی.');

  const envelope = JSON.parse(responseText.slice(jsonStart));
  const nestedResult = envelope && envelope[0] && envelope[0][2];
  if (typeof nestedResult !== 'string') {
    throw new Error('د غږیز فایل معلومات په ځواب کې ونه موندل شول.');
  }

  const audioBase64 = JSON.parse(nestedResult)?.[0];
  if (typeof audioBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(audioBase64)) {
    throw new Error('د غږیز فایل بڼه ناسمه ده.');
  }

  const audioBuffer = Buffer.from(audioBase64, 'base64');
  if (audioBuffer.length < 100) throw new Error('غږیز فایل تش یا نیمګړی دی.');
  return audioBuffer;
}

async function createLessonAudioParts(lesson, options = {}) {
  const chunks = buildLessonSpeechChunks(lesson, options.maxChars || MAX_TTS_CHARS);
  if (!chunks.length) return [];

  const primaryHost = options.host || DEFAULT_HOST;
  const hosts = [...new Set([primaryHost, ...(options.fallback === false ? [] : [FALLBACK_HOST])])];
  const requestAudio = options.requestAudio || requestGoogleTtsAudio;
  const parts = [];

  for (const chunk of chunks) {
    let audioBuffer = null;
    let lastError = null;

    for (const host of hosts) {
      try {
        audioBuffer = await requestAudio(chunk.text, {
          host,
          lang: 'en',
          slow: options.slow !== false,
          timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
          fetchImpl: options.fetchImpl,
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length < 100) {
      throw new Error('د "' + chunk.label + '" غږیزه برخه جوړه نه شوه: ' +
        String(lastError && lastError.message ? lastError.message : lastError || 'ناڅرګنده ستونزه').slice(0, 180));
    }

    parts.push({
      label: chunk.label,
      text: chunk.text,
      buffer: audioBuffer,
    });
  }

  return parts;
}

module.exports = {
  MAX_TTS_CHARS,
  cleanEnglishLine,
  buildLessonSpeechChunks,
  requestGoogleTtsAudio,
  createLessonAudioParts,
};
