'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_VOICE = 'en-US-GuyNeural';
const DEFAULT_LANG = 'en-US';
const DEFAULT_RATE = '-5%';
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TTS_CHARS = 180;
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

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

async function requestEdgeTtsAudio(text, options = {}) {
  const spokenText = String(text || '').trim();
  if (!spokenText) throw new TypeError('د غږ لپاره متن تش دی.');
  if (spokenText.length > 5000) {
    throw new RangeError('د غږیزې برخې متن له ۵۰۰۰ تورو زیات دی.');
  }

  const EdgeTTS = options.EdgeTTS || require('node-edge-tts').EdgeTTS;
  if (typeof EdgeTTS !== 'function') {
    throw new Error('د Microsoft Edge TTS کتابتون سم نه دی نصب شوی.');
  }

  const voice = String(options.voice || DEFAULT_VOICE);
  const lang = String(options.lang || DEFAULT_LANG);
  const rate = String(options.rate || DEFAULT_RATE);
  const timeout = Math.max(5000, Math.min(
    Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS,
    120000
  ));

  const tempDirectory = await fs.mkdtemp(
    path.join(options.tempDir || os.tmpdir(), 'maloomat-edge-tts-')
  );
  const audioPath = path.join(tempDirectory, 'lesson-audio.mp3');

  try {
    const tts = new EdgeTTS({
      voice,
      lang,
      outputFormat: OUTPUT_FORMAT,
      rate,
      pitch: 'default',
      volume: 'default',
      timeout,
    });

    await tts.ttsPromise(spokenText, audioPath);
    const audioBuffer = await fs.readFile(audioPath);
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length < 100) {
      throw new Error('Microsoft Edge TTS تش یا نیمګړی غږیز فایل جوړ کړ.');
    }
    return audioBuffer;
  } catch (error) {
    const reason = String(error && error.message ? error.message : error || 'نامعلومه ستونزه');
    throw new Error('د Microsoft Edge نارینه غږ جوړ نه شو: ' + reason.slice(0, 180));
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

async function createLessonAudioParts(lesson, options = {}) {
  const chunks = buildLessonSpeechChunks(lesson, options.maxChars || MAX_TTS_CHARS);
  if (!chunks.length) return [];

  const requestAudio = options.requestAudio || requestEdgeTtsAudio;
  const parts = [];

  for (const chunk of chunks) {
    const audioBuffer = await requestAudio(chunk.text, {
      voice: options.voice || DEFAULT_VOICE,
      lang: options.lang || DEFAULT_LANG,
      rate: options.rate || DEFAULT_RATE,
      timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      tempDir: options.tempDir,
      EdgeTTS: options.EdgeTTS,
    });

    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length < 100) {
      throw new Error('د "' + chunk.label + '" غږیزه برخه تشه یا نیمګړې ده.');
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
  DEFAULT_VOICE,
  DEFAULT_LANG,
  DEFAULT_RATE,
  DEFAULT_TIMEOUT_MS,
  MAX_TTS_CHARS,
  cleanEnglishLine,
  buildLessonSpeechChunks,
  requestEdgeTtsAudio,
  createLessonAudioParts,
};
