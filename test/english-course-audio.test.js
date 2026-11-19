'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  DEFAULT_VOICE,
  DEFAULT_LANG,
  DEFAULT_RATE,
  DEFAULT_PASHTO_VOICE,
  DEFAULT_PASHTO_LANG,
  DEFAULT_PASHTO_RATE,
  buildLessonSpeechChunks,
  createLessonAudioParts,
  requestEdgeTtsAudio,
} = require('../lib/english-course-audio');

function sampleLesson() {
  return {
    day: 2,
    topic: 'د ځان پېژندنه (Introducing Yourself)',
    goal: 'زده‌کوونکی خپل نوم او د اوسېدو ځای په ساده جملو بیانولای شي.',
    vocab: [
      ['My name is ...', 'زما نوم ... دی.', 'مای نېم اِز'],
      ['What is your name?', 'ستاسو نوم څه دی؟', 'واټ اِز یور نېم'],
    ],
    grammar: 'د ځان پېژندنې لپاره My name is ... کاروو. د نوم پوښتنه What is your name? ده.',
    examples: ['My name is Ahmad.', 'I am from Afghanistan.'],
    dialogue: ['A: Hello! What is your name?', 'B: My name is Ahmad.'],
    exercises: [
      ['«زما نوم مریم دی» وژباړئ.', 'My name is Maryam.'],
      ['د What is your name? معنا ولیکئ.', 'ستاسو نوم څه دی؟'],
    ],
    homework: 'د خپل نوم، ولایت او زده‌کوونکي‌والي په اړه څلور ساده انګلیسي جملې ولیکئ.',
  };
}

test('builds separate English pronunciation and Afghan Pashto explanation chunks', () => {
  const chunks = buildLessonSpeechChunks(sampleLesson());
  const english = chunks.filter((part) => part.language === 'en-US');
  const pashto = chunks.filter((part) => part.language === 'ps-AF');

  assert.ok(english.some((part) => part.label === 'English vocabulary' && part.text.includes('My name is')));
  assert.ok(english.some((part) => part.label === 'English examples' && part.text.includes('Afghanistan')));
  assert.ok(english.some((part) => part.label === 'English dialogue' && part.text.includes('What is your name')));
  assert.ok(pashto.some((part) => part.label === 'Pashto vocabulary meanings' && part.text.includes('زما نوم')));
  assert.ok(pashto.some((part) => part.label === 'Pashto lesson explanation' && part.text.includes('زده‌کوونکی')));
  assert.ok(pashto.some((part) => part.label === 'Pashto exercise instructions' && part.text.includes('وژباړئ')));
  assert.ok(pashto.some((part) => part.label === 'Pashto homework' && part.text.includes('کورنۍ دنده')));

  assert.ok(english.every((part) => !/[\u0600-\u06FF]/u.test(part.text)));
  assert.ok(pashto.every((part) => !/[A-Za-z]/u.test(part.text)));
  assert.ok(chunks.every((part) => part.text.length <= 180));
});

test('keeps mixed example lines in the correct language without losing English speech', () => {
  const chunks = buildLessonSpeechChunks({
    vocab: [['A a', 'الف', 'اې']],
    examples: ['A – M – A – N: د Aman نوم توري جلا جلا ووایئ.'],
    dialogue: ['A: How are you?', 'B: I am fine, thank you.'],
  });

  assert.ok(chunks.some((part) => part.language === 'en-US' && part.text.includes('A, M, A, N')));
  assert.ok(chunks.some((part) => part.language === 'en-US' && part.text.includes('How are you?')));
  assert.ok(chunks.some((part) => part.language === 'ps-AF' && part.text.includes('الف')));
});

test('uses the English Microsoft Edge male voice and learner-friendly pace by default', async () => {
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

test('supports the Afghan GulNawaz Microsoft Edge Pashto voice', async () => {
  let configuration = null;
  const expected = Buffer.alloc(256, 8);

  class FakeEdgeTTS {
    constructor(options) {
      configuration = options;
    }

    async ttsPromise(text, filePath) {
      assert.equal(text, 'زما نوم احمد دی.');
      await fs.writeFile(filePath, expected);
    }
  }

  const actual = await requestEdgeTtsAudio('زما نوم احمد دی.', {
    EdgeTTS: FakeEdgeTTS,
    voice: DEFAULT_PASHTO_VOICE,
    lang: DEFAULT_PASHTO_LANG,
    rate: DEFAULT_PASHTO_RATE,
  });

  assert.equal(actual.toString('hex'), expected.toString('hex'));
  assert.equal(configuration.voice, 'ps-AF-GulNawazNeural');
  assert.equal(configuration.lang, 'ps-AF');
  assert.equal(configuration.rate, '-5%');
});

test('creates lesson audio with separate English and Pashto voice settings', async () => {
  const requested = [];
  const parts = await createLessonAudioParts(sampleLesson(), {
    requestAudio: async (text, options) => {
      requested.push({ text, options });
      return Buffer.alloc(256, 2);
    },
  });

  assert.ok(parts.length >= 5);
  assert.equal(requested.length, parts.length);
  assert.ok(requested.some((item) =>
    item.options.voice === DEFAULT_VOICE &&
    item.options.lang === DEFAULT_LANG &&
    item.text.includes('My name is')
  ));
  assert.ok(requested.some((item) =>
    item.options.voice === DEFAULT_PASHTO_VOICE &&
    item.options.lang === DEFAULT_PASHTO_LANG &&
    item.text.includes('زما نوم')
  ));
  assert.ok(parts.every((part) => Buffer.isBuffer(part.buffer) && part.buffer.length >= 100));
});

test('keeps Pashto audio available even when a lesson has no English vocabulary', async () => {
  const requested = [];
  const parts = await createLessonAudioParts({
    topic: 'د پښتو تشریح',
    goal: 'زده‌کوونکی موضوع پېژني.',
    grammar: 'دا یوه پښتو تشریح ده.',
    vocab: [],
    examples: [],
    dialogue: [],
    exercises: [],
    homework: 'درس تکرار کړئ.',
  }, {
    requestAudio: async (text, options) => {
      requested.push({ text, options });
      return Buffer.alloc(256, 3);
    },
  });

  assert.ok(parts.length > 0);
  assert.ok(requested.every((item) => item.options.voice === DEFAULT_PASHTO_VOICE));
  assert.ok(requested.every((item) => item.options.lang === DEFAULT_PASHTO_LANG));
});

test('does not create audio when a lesson has no spoken text', async () => {
  const parts = await createLessonAudioParts({
    vocab: [],
    examples: [],
    dialogue: [],
    exercises: [],
  });
  assert.deepEqual(parts, []);
});
