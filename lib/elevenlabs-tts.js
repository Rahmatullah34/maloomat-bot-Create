'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const API_BASE_URL = 'https://api.elevenlabs.io/v1';
const DEFAULT_VOICE_ID = 'zHPHAoaYvoRg7Pu3lOMr'; // NK - Pashto Professional
const DEFAULT_MODEL_ID = 'eleven_v3';
const MAX_TTS_CHARS = 2200; // Stay within the usual free-tier per-request limit.
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_CACHE_DIR = path.resolve(process.cwd(), 'data', 'english-course-audio');

function splitText(text, maxChars = MAX_TTS_CHARS) {
  const value = String(text || '').trim();
  if (!value) return [];
  const paragraphs = value.split(/\n+/u).map((line) => line.trim()).filter(Boolean);
  const chunks = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const sentences = paragraph.match(/[^.!?؟]+[.!?؟]?/gu) || [paragraph];
    for (const sentenceValue of sentences) {
      const sentence = sentenceValue.trim();
      if (!sentence) continue;
      if (sentence.length > maxChars) {
        if (current) chunks.push(current);
        current = '';
        const words = sentence.split(/\s+/u);
        for (const word of words) {
          const candidate = current ? current + ' ' + word : word;
          if (candidate.length > maxChars) {
            if (current) chunks.push(current);
            current = word;
          } else {
            current = candidate;
          }
        }
        continue;
      }

      const candidate = current ? current + '\n' + sentence : sentence;
      if (candidate.length > maxChars) {
        if (current) chunks.push(current);
        current = sentence;
      } else {
        current = candidate;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function buildLessonNarrationText(lesson) {
  if (!lesson || typeof lesson !== 'object') return '';
  const lines = [];

  lines.push('د انګلیسي ژبې د نن ورځې درس. موضوع: ' + String(lesson.topic || ''));
  if (lesson.goal) lines.push('د درس موخه: ' + String(lesson.goal));

  const vocab = Array.isArray(lesson.vocab) ? lesson.vocab : [];
  if (vocab.length) {
    lines.push('اوس نوې کلمې زده کوو.');
    for (const item of vocab) {
      if (!Array.isArray(item) || !item[0]) continue;
      lines.push(String(item[0]) + '. پښتو مانا: ' + String(item[1] || '') + '.');
    }
  }

  if (lesson.grammar) {
    lines.push('د ګرامر تشریح.');
    lines.push(String(lesson.grammar));
  }

  const examples = Array.isArray(lesson.examples) ? lesson.examples : [];
  if (examples.length) {
    lines.push('اوس د انګلیسي ژبې بېلګې واورو.');
    for (const item of examples) {
      const value = String(item || '').trim();
      if (value) lines.push('بېلګه: ' + value);
    }
  }

  const dialogue = Array.isArray(lesson.dialogue) ? lesson.dialogue : [];
  if (dialogue.length) {
    lines.push('اوس د خبرو اترو لنډه بېلګه واورو.');
    let speaker = 0;
    for (const item of dialogue) {
      const value = String(item || '').trim();
      if (!value) continue;
      const match = value.match(/^([AB])\\s*[:：]\\s*(.*)$/iu);
      if (match) {
        speaker = match[1].toUpperCase() === 'A' ? 1 : 2;
        lines.push((speaker === 1 ? 'لومړی ویونکی وایي: ' : 'دویم ویونکی وایي: ') + match[2]);
      } else {
        lines.push(value);
      }
    }
  }

  const exercises = Array.isArray(lesson.exercises) ? lesson.exercises : [];
  if (exercises.length) {
    lines.push('اوس د تمرین پوښتنې واورو. لومړی خپله هڅه وکړئ.');
    for (const [index, item] of exercises.entries()) {
      if (!Array.isArray(item) || !item[0]) continue;
      lines.push('پوښتنه ' + (index + 1) + ': ' + String(item[0]));
    }
  }

  if (lesson.homework) {
    lines.push('کورنۍ دنده: ' + String(lesson.homework));
  }

  return lines.join('\n');
}

function buildLessonSpeechChunks(lesson, maxChars = MAX_TTS_CHARS) {
  const text = buildLessonNarrationText(lesson);
  return splitText(text, maxChars).map((chunk, index) => ({
    label: 'Lesson ' + (Number(lesson.day) || '') + ' audio ' + (index + 1),
    text: chunk,
  }));
}

async function requestElevenLabsTtsAudio(text, options = {}) {
  const apiKey = String(options.apiKey || '').trim();
  const voiceId = String(options.voiceId || DEFAULT_VOICE_ID).trim();
  const modelId = String(options.modelId || DEFAULT_MODEL_ID).trim();
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (!apiKey) throw new Error('ELEVENLABS_API_KEY چاپېریالي متغیر نه دی تنظیم شوی.');
  if (!voiceId) throw new Error('د ElevenLabs غږ ID نه دی تنظیم شوی.');
  if (!text || String(text).length > MAX_TTS_CHARS) {
    throw new RangeError('د غږیزې برخې متن باید له ' + MAX_TTS_CHARS + ' تورو زیات نه وي.');
  }
  if (typeof fetchImpl !== 'function') throw new Error('د Node.js fetch خدمت موجود نه دی.');

  const url = API_BASE_URL + '/text-to-speech/' + encodeURIComponent(voiceId) +
    '?output_format=mp3_44100_128';
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      accept: 'audio/mpeg',
      'content-type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: String(text),
      model_id: modelId,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.text()).slice(0, 300);
    } catch {}
    // API response body is safe to log; never include the request headers or key.
    throw new Error('ElevenLabs TTS ناکام شو (HTTP ' + response.status + ')' +
      (detail ? ': ' + detail : ''));
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  if (audioBuffer.length < 100) throw new Error('ElevenLabs تش یا نیمګړی غږیز فایل راولېږه.');
  return audioBuffer;
}

function cacheKeyForLesson(lesson, voiceId, modelId, chunks) {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ lesson, voiceId, modelId, chunks }))
    .digest('hex')
    .slice(0, 24);
}

async function createLessonAudioParts(lesson, options = {}) {
  const voiceId = String(options.voiceId || DEFAULT_VOICE_ID).trim();
  const modelId = String(options.modelId || DEFAULT_MODEL_ID).trim();
  const chunks = buildLessonSpeechChunks(lesson, options.maxChars || MAX_TTS_CHARS);
  if (!chunks.length) return [];

  const cacheDir = options.cacheDir || DEFAULT_CACHE_DIR;
  const cacheKey = cacheKeyForLesson(lesson, voiceId, modelId, chunks);
  const lessonCacheDir = path.join(cacheDir, 'lesson-' + (Number(lesson.day) || 0), cacheKey);
  const requestAudio = options.requestAudio || requestElevenLabsTtsAudio;
  const parts = [];

  fs.mkdirSync(lessonCacheDir, { recursive: true, mode: 0o700 });

  for (const [index, chunk] of chunks.entries()) {
    const audioPath = path.join(lessonCacheDir, 'part-' + String(index + 1).padStart(2, '0') + '.mp3');
    let audioBuffer = null;

    try {
      if (fs.existsSync(audioPath)) {
        audioBuffer = fs.readFileSync(audioPath);
      }
    } catch {
      audioBuffer = null;
    }

    if (!audioBuffer || audioBuffer.length < 100) {
      audioBuffer = await requestAudio(chunk.text, {
        apiKey: options.apiKey,
        voiceId,
        modelId,
        timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
        fetchImpl: options.fetchImpl,
      });
      if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length < 100) {
        throw new Error('د غږیزې برخې جوړول ناکام شول.');
      }

      const temporaryPath = audioPath + '.' + process.pid + '.tmp';
      fs.writeFileSync(temporaryPath, audioBuffer, { mode: 0o600 });
      fs.renameSync(temporaryPath, audioPath);
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
  DEFAULT_VOICE_ID,
  DEFAULT_MODEL_ID,
  MAX_TTS_CHARS,
  buildLessonNarrationText,
  buildLessonSpeechChunks,
  requestElevenLabsTtsAudio,
  createLessonAudioParts,
};
