'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_VOICE_ID,
  DEFAULT_MODEL_ID,
  buildLessonNarrationText,
  buildLessonSpeechChunks,
  requestElevenLabsTtsAudio,
  createLessonAudioParts,
} = require('../lib/elevenlabs-tts');

function sampleLesson() {
  return {
    day: 2,
    topic: 'د ځان پېژندنه (Introducing Yourself)',
    goal: 'زده‌کوونکی خپل نوم او د اوسېدو ځای بیانولای شي.',
    vocab: [
      ['My name is ...', 'زما نوم ... دی.', 'مای نېم اِز'],
      ['I am from Afghanistan.', 'زه د افغانستان یم.', 'آی اَم فرام اَفغانېستان'],
    ],
    grammar: 'د ځان پېژندنې لپاره My name is ... کاروو.',
    examples: ['My name is Ahmad.', 'I live in Kabul.'],
    dialogue: ['A: What is your name?', 'B: My name is Ahmad.'],
    exercises: [
      ['«زما نوم مریم دی» وژباړئ.', 'My name is Maryam.'],
    ],
    homework: 'د خپل نوم په اړه څلور جملې ولیکئ.',
  };
}

test('builds bilingual lesson narration with Pashto explanations and English examples', () => {
  const text = buildLessonNarrationText(sampleLesson());
  assert.match(text, /My name is/);
  assert.match(text, /زما نوم/);
  assert.match(text, /د ګرامر تشریح/);
  assert.match(text, /What is your name\?/);
  assert.match(text, /لومړی ویونکی وایي/);
  assert.match(text, /دویم ویونکی وایي/);
  assert.match(text, /کورنۍ دنده|کورنۍ دنده/u);
  assert.doesNotMatch(text, /مای نېم اِز/u);
});

test('does not read the answer key aloud during lesson exercises', () => {
  const text = buildLessonNarrationText(sampleLesson());
  assert.match(text, /زما نوم مریم دی/u);
  assert.doesNotMatch(text, /My name is Maryam/u);
});

test('splits narration under free-tier safe request size', () => {
  const chunks = buildLessonSpeechChunks({
    day: 1,
    topic: 'سلام',
    grammar: 'پښتو تشریح. '.repeat(250),
  }, 600);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.text.length <= 600));
});

test('sends authenticated request to the ElevenLabs TTS API and returns MP3 bytes', async () => {
  const expected = Buffer.alloc(256, 9);
  let requestUrl = '';
  let requestInit = {};
  const actual = await requestElevenLabsTtsAudio('سلام، Hello.', {
    apiKey: 'test-secret',
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => expected,
      };
    },
  });

  assert.equal(actual.toString('hex'), expected.toString('hex'));
  assert.match(requestUrl, new RegExp('/text-to-speech/' + DEFAULT_VOICE_ID));
  assert.match(requestUrl, /output_format=mp3_44100_128/u);
  assert.equal(requestInit.headers['xi-api-key'], 'test-secret');
  assert.equal(JSON.parse(requestInit.body).model_id, DEFAULT_MODEL_ID);
  assert.equal(JSON.parse(requestInit.body).text, 'سلام، Hello.');
});

test('rejects a missing API key before making any request', async () => {
  let called = false;
  await assert.rejects(
    requestElevenLabsTtsAudio('Hello.', {
      fetchImpl: async () => {
        called = true;
      },
    }),
    /ELEVENLABS_API_KEY/u
  );
  assert.equal(called, false);
});

test('caches generated lesson audio on disk so restarts do not re-spend credits', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'elevenlabs-audio-'));
  try {
    let calls = 0;
    const options = {
      apiKey: 'test-secret',
      cacheDir: directory,
      requestAudio: async () => {
        calls += 1;
        return Buffer.alloc(256, 4);
      },
    };
    const first = await createLessonAudioParts(sampleLesson(), options);
    const second = await createLessonAudioParts(sampleLesson(), options);

    assert.ok(first.length > 0);
    assert.equal(second.length, first.length);
    assert.equal(calls, first.length);
    assert.ok(second.every((part) => part.buffer[0] === 4));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
