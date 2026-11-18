'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  DEFAULT_VOICE,
  DEFAULT_LANG,
  DEFAULT_RATE,
  buildLessonSpeechChunks,
  createLessonAudioParts,
  requestEdgeTtsAudio,
} = require('../lib/english-course-audio');

test('builds English-only speech chunks and removes mixed Pashto explanations', () => {
  const chunks = buildLessonSpeechChunks({
    vocab: [
      ['Hello', 'سلام', 'هېلو'],
      ['A a', 'الف', 'اې'],
      ['Good morning', 'سهار مو پخیر', 'ګُډ مارنینګ'],
    ],
    examples: [
      'Hello! My name is Ahmad.',
      'A – M – A – N: د Aman نوم توري جلا جلا ووایئ.',
    ],
    dialogue: [
      'A: How are you?',
      'B: I am fine, thank you.',
      'B: It means “کتاب”.',
    ],
  });

  assert.ok(chunks.some((part) => part.label === 'Vocabulary' && part.text.includes('Hello')));
  assert.ok(chunks.some((part) => part.text.includes('A, M, A, N')));
  assert.ok(chunks.some((part) => part.text.includes('How are you?')));
  assert.ok(chunks.every((part) => !/[\u0600-\u06FF]/u.test(part.text)));
  assert.ok(chunks.every((part) => part.text.length <= 180));
  assert.ok(chunks.every((part) => !/^[AB]:/u.test(part.text)));
});

test('uses examples and dialogue when a review lesson has no vocabulary list', () => {
  const chunks = buildLessonSpeechChunks({
    vocab: [],
    examples: ['I wake up at six.', 'Do you read books?'],
    dialogue: ['A: What time do you wake up?', 'B: I wake up at six o’clock.'],
  });

  assert.ok(chunks.length > 0);
  assert.ok(chunks.some((part) => part.label === 'Examples'));
  assert.ok(chunks.some((part) => part.label === 'Dialogue'));
  assert.ok(chunks.every((part) => part.text.length <= 180));
});

test('uses the pleasant male Microsoft Edge voice with a learner-friendly pace', async () => {
  let configuration = null;
  let outputPath = null;
  const expected = Buffer.alloc(256, 7);

  class FakeEdgeTTS {
    constructor(options) {
      configuration = options;
    }

    async ttsPromise(text, filePath) {
      assert.equal(text, 'Hello there.');
      outputPath = filePath;
      await fs.writeFile(filePath, expected);
    }
  }

  const actual = await requestEdgeTtsAudio('Hello there.', {
    EdgeTTS: FakeEdgeTTS,
    timeoutMs: 1000,
  });

  assert.equal(actual.toString('hex'), expected.toString('hex'));
  assert.equal(configuration.voice, DEFAULT_VOICE);
  assert.equal(configuration.lang, DEFAULT_LANG);
  assert.equal(configuration.rate, DEFAULT_RATE);
  assert.equal(configuration.outputFormat, 'audio-24khz-48kbitrate-mono-mp3');
  assert.ok(configuration.timeout >= 5000);
  await assert.rejects(fs.access(path.dirname(outputPath)));
});

test('creates a separate audio part for each lesson chunk without mixing days', async () => {
  const requested = [];
  const parts = await createLessonAudioParts({
    day: 2,
    vocab: [['My name is ...', 'زما نوم ... دی.', 'مای نېم اِز']],
    examples: ['My name is Ahmad.', 'I am from Afghanistan.'],
    dialogue: ['A: What is your name?', 'B: My name is Ahmad.'],
  }, {
    requestAudio: async (text, options) => {
      requested.push({ text, options });
      return Buffer.alloc(256, 2);
    },
  });

  assert.ok(parts.length >= 2);
  assert.equal(requested.length, parts.length);
  assert.ok(requested.every((item) => item.options.voice === DEFAULT_VOICE));
  assert.ok(requested.every((item) => item.options.lang === DEFAULT_LANG));
  assert.ok(requested.every((item) => item.options.rate === DEFAULT_RATE));
  assert.ok(parts.every((part) => Buffer.isBuffer(part.buffer) && part.buffer[0] === 2));
});

test('does not create audio when a lesson has no English text', async () => {
  const parts = await createLessonAudioParts({ vocab: [], examples: [], dialogue: [] });
  assert.deepEqual(parts, []);
});
