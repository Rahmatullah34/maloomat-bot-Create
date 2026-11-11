'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLessonSpeechChunks,
  createLessonAudioParts,
  requestGoogleTtsAudio,
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
  assert.ok(requested.every((item) => item.options.lang === 'en'));
  assert.ok(requested.every((item) => item.options.slow === true));
  assert.ok(parts.every((part) => Buffer.isBuffer(part.buffer) && part.buffer[0] === 2));
});

test('parses Google speech response as JSON without evaluating returned text', async () => {
  const expected = Buffer.alloc(256, 7);
  const base64 = expected.toString('base64');
  const nested = JSON.stringify([base64]);
  const envelope = [['wrb.fr', 'jQ1olc', JSON.stringify(nested)]];
  let requestUrl = '';
  let requestBody = '';

  const actual = await requestGoogleTtsAudio('Hello there.', {
    host: 'https://translate.google.com',
    timeoutMs: 1000,
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestBody = init.body;
      return {
        ok: true,
        status: 200,
        text: async () => ")]}'\n" + JSON.stringify(envelope),
      };
    },
  });

  assert.equal(actual.toString('hex'), expected.toString('hex'));
  assert.match(requestUrl, /translate\.google\.com\/_\/TranslateWebserverUi\/data\/batchexecute/u);
  assert.match(requestBody, /^f\.req=/u);
});
