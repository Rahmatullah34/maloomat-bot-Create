'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  answerVariants,
  createEnglishCourseService,
  dayNumberFromStart,
  getKabulTimeParts,
  isCourseCommand,
  normalizeAnswer,
  readTargetConfig,
} = require('../lib/english-course');

function temporaryState() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maloomat-english-'));
  return {
    path: path.join(directory, 'state.json'),
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

test('uses Kabul local time for the 20:00 lesson slot', () => {
  const local = getKabulTimeParts(new Date('2026-11-10T15:34:00.000Z'));
  assert.equal(local.dateKey, '2026-11-10');
  assert.equal(local.hour, 20);
  assert.equal(local.minute, 4);
});

test('calculates the course day from its configured start date', () => {
  assert.equal(dayNumberFromStart('2026-11-10', '2026-11-10'), 1);
  assert.equal(dayNumberFromStart('2026-11-10', '2026-11-16'), 7);
  assert.equal(dayNumberFromStart('2026-11-10', '2026-12-09'), 30);
});

test('normalizes learner answers and supports the alternative answers in the lesson data', () => {
  assert.equal(normalizeAnswer(' I AM FINE, thank you. '), 'i am fine thank you');
  assert.deepEqual(answerVariants('I do not like tea. / I don’t like tea.'), [
    'i do not like tea',
    'i dont like tea',
  ]);
});

test('recognizes only the dedicated English course commands', () => {
  assert.equal(isCourseCommand('درس'), true);
  assert.equal(isCourseCommand('تمرین'), true);
  assert.equal(isCourseCommand('ځواب: 1 - Hello'), true);
  assert.equal(isCourseCommand('I am fine, thank you - 2'), true);
  assert.equal(isCourseCommand('2 - I am fine, thank you.'), true);
  assert.equal(isCourseCommand('سلام'), false);
  assert.equal(isCourseCommand('د زړه دنده څه ده؟'), false);
});

test('uses the same configured auto-post group unless a dedicated course group is set', () => {
  const config = readTargetConfig(
    { AUTO_POST_ENABLED: 'true', AUTO_POST_GROUP_JID: '12345-678@g.us' },
    path.join(os.tmpdir(), 'missing-english-course-config.json')
  );
  assert.equal(config.enabled, true);
  assert.equal(config.groupJid, '12345-678@g.us');

  const blocked = readTargetConfig(
    {
      AUTO_POST_ENABLED: 'true',
      AUTO_POST_GROUP_JID: '12345-678@g.us',
      ALLOWED_GROUPS: '99999-888@g.us',
    },
    path.join(os.tmpdir(), 'missing-english-course-config.json')
  );
  assert.equal(blocked.groupJid, '');
});

test('formats lesson, practice and weekly quiz content from the 30-day source file', () => {
  const state = temporaryState();
  try {
    const sent = [];
    const service = createEnglishCourseService({
      statePath: state.path,
      safeSend: async (_socket, jid, content) => {
        sent.push({ jid, text: content.text });
        return { key: { id: 'sent' } };
      },
      getConfig: () => ({ enabled: true, groupJid: '12345-678@g.us' }),
    });
    assert.match(service.formatLesson(1, false), /سلام او روغبړ/);
    assert.match(service.formatLesson(1, false), /Hello/);
    assert.match(service.formatLesson(1, false), /3 - Goodbye/);
    assert.match(service.formatPractice(1), /د انګلیسي تمرین/);
    assert.match(service.formatPractice(1), /3 - Goodbye/);
    assert.match(service.formatQuiz(7), /د اونۍ ازموینه/);
    assert.match(service.formatQuiz(7), /3 - Goodbye/);
    assert.match(service.formatQuiz(7), /10/);
    assert.equal(sent.length, 0);
  } finally {
    state.cleanup();
  }
});

test('routes course commands only in the configured group and evaluates numbered answers', async () => {
  const state = temporaryState();
  try {
    const today = getKabulTimeParts(new Date()).dateKey;
    const courseNow = new Date(today + 'T20:05:00+04:30');
    fs.writeFileSync(state.path, JSON.stringify({
      version: 1,
      startDate: today,
      posts: { [today + '@20:00']: { status: 'sent', day: 1 } },
      progress: {},
    }));
    const sent = [];
    const service = createEnglishCourseService({
      statePath: state.path,
      getNow: () => courseNow,
      getConfig: () => ({ enabled: true, groupJid: '12345-678@g.us' }),
      safeSend: async (_socket, jid, content) => {
        sent.push({ jid, text: content.text });
        return { key: { id: 'sent' } };
      },
    });

    const wrongGroup = await service.handleCommand({}, '99999-888@g.us', 'درس', {});
    assert.equal(wrongGroup, false);

    const handled = await service.handleCommand({}, '12345-678@g.us', '1 - Good morning', {
      participantKey: '15551234567@s.whatsapp.net',
      name: 'زده‌کوونکی',
    });
    assert.equal(handled, true);
    assert.match(sent[0].text, /ځواب مو سم دی/);
    assert.match(sent[0].text, /نمرې: 1/);

    const duplicate = await service.handleCommand({}, '12345-678@g.us', '1 - Good morning', {
      participantKey: '15551234567@s.whatsapp.net',
    });
    assert.equal(duplicate, true);
    assert.match(sent[1].text, /مخکې سمه حل شوې/);

    const progress = JSON.parse(fs.readFileSync(state.path, 'utf8'));
    assert.equal(progress.progress['12345-678@g.us']['15551234567@s.whatsapp.net']['1']['1'].points, 1);
  } finally {
    state.cleanup();
  }
});

test('scores answer-first format such as I am fine, thank you - 2', async () => {
  const state = temporaryState();
  try {
    const today = getKabulTimeParts(new Date()).dateKey;
    const courseNow = new Date(today + 'T20:05:00+04:30');
    fs.writeFileSync(state.path, JSON.stringify({
      version: 1,
      startDate: today,
      posts: { [today + '@20:00']: { status: 'sent', day: 1 } },
      progress: {},
    }));
    const sent = [];
    const service = createEnglishCourseService({
      statePath: state.path,
      getNow: () => courseNow,
      getConfig: () => ({ enabled: true, groupJid: '12345-678@g.us' }),
      safeSend: async (_socket, jid, content) => {
        sent.push({ jid, text: content.text });
        return { key: { id: 'sent' } };
      },
    });

    const handled = await service.handleCommand(
      {},
      '12345-678@g.us',
      'I am fine, thank you - 2',
      { participantKey: '15551234567@s.whatsapp.net' }
    );
    assert.equal(handled, true);
    assert.match(sent[0].text, /ځواب مو سم دی/);
    assert.match(sent[0].text, /نمرې: 1/);
    const progress = JSON.parse(fs.readFileSync(state.path, 'utf8'));
    assert.equal(
      progress.progress['12345-678@g.us']['15551234567@s.whatsapp.net']['1']['2'].points,
      1
    );
  } finally {
    state.cleanup();
  }
});

test('posts the first lesson once at 20:00 Kabul time and will not duplicate it', async () => {
  const state = temporaryState();
  try {
    const sent = [];
    const service = createEnglishCourseService({
      statePath: state.path,
      getEnv: () => ({
        ENGLISH_COURSE_AUDIO_PAUSED: 'false',
        ENGLISH_COURSE_AUDIO_ENABLED: 'true',
      }),
      getConfig: () => ({ enabled: true, groupJid: '12345-678@g.us' }),
      generateAudioParts: async (lesson) => [{
        label: 'Vocabulary',
        buffer: Buffer.alloc(128, Number(lesson.day)),
      }],
      safeSend: async (_socket, jid, content) => {
        sent.push({ jid, content });
        return { key: { id: 'scheduled-message' } };
      },
    });
    const getSocket = () => ({ sendMessage: async () => ({ key: { id: 'unused' } }) });
    const scheduled = new Date('2026-11-10T15:34:00.000Z');

    await service.tick(getSocket, scheduled);
    await service.tick(getSocket, scheduled);

    assert.equal(sent.length, 3);
    assert.match(sent[0].content.text, /ورځ: 1 له ۳۰ څخه/);
    assert.match(sent[1].content.text, /غږیز تلفظ/);
    assert.ok(Buffer.isBuffer(sent[2].content.audio));
    assert.equal(sent[2].content.mimetype, 'audio/mpeg');
    const progress = JSON.parse(fs.readFileSync(state.path, 'utf8'));
    assert.equal(progress.startDate, '2026-11-10');
    assert.equal(progress.posts['2026-11-10@20:00'].status, 'sent');
    assert.equal(progress.posts['2026-11-10@20:00'].audioStatus, 'sent');
    assert.equal(progress.posts['2026-11-10@20:00'].audioParts, 1);
  } finally {
    state.cleanup();
  }
});


test('keeps lesson audio generation and upload paused by default', async () => {
  const state = temporaryState();
  try {
    const today = '2026-11-10';
    fs.writeFileSync(state.path, JSON.stringify({
      version: 1,
      startDate: today,
      posts: { [today + '@20:00']: { status: 'sent', day: 1 } },
      progress: {},
    }));
    const sent = [];
    let generated = 0;
    const service = createEnglishCourseService({
      statePath: state.path,
      getNow: () => new Date('2026-11-10T15:35:00.000Z'),
      getConfig: () => ({ enabled: true, groupJid: '12345-678@g.us' }),
      generateAudioParts: async () => {
        generated += 1;
        return [{ label: 'Vocabulary', buffer: Buffer.alloc(128) }];
      },
      safeSend: async (_socket, jid, content) => {
        sent.push({ jid, content });
        return { key: { id: 'sent' } };
      },
    });

    await service.handleCommand({}, '12345-678@g.us', 'درس', {});
    assert.equal(sent.length, 1);
    assert.match(sent[0].content.text, /غږیز تلفظ برخه اوس موقتي بنده ده/);
    assert.equal(generated, 0);
    assert.equal(service.getStatus().audioEnabled, false);
  } finally {
    state.cleanup();
  }
});


test('keeps the last published lesson until the next 20:00 post, without skipping missed days', async () => {
  const state = temporaryState();
  try {
    fs.writeFileSync(state.path, JSON.stringify({
      version: 1,
      startDate: '2026-11-09',
      posts: {
        '2026-11-09@20:00': { status: 'sent', day: 1 },
      },
      progress: {},
    }));

    let now = new Date('2026-11-11T19:59:00+04:30');
    const sent = [];
    const generatedDays = [];
    const service = createEnglishCourseService({
      statePath: state.path,
      getNow: () => now,
      getEnv: () => ({
        ENGLISH_COURSE_AUDIO_PAUSED: 'false',
        ENGLISH_COURSE_AUDIO_ENABLED: 'true',
      }),
      getConfig: () => ({ enabled: true, groupJid: '12345-678@g.us' }),
      generateAudioParts: async (lesson) => {
        generatedDays.push(lesson.day);
        return [{
          label: 'Vocabulary',
          buffer: Buffer.alloc(128, Number(lesson.day)),
        }];
      },
      safeSend: async (_socket, jid, content) => {
        sent.push({ jid, content });
        return { key: { id: 'sent-' + sent.length } };
      },
    });

    await service.handleCommand({}, '12345-678@g.us', 'درس', {});
    assert.match(sent[0].content.text, /ورځ: 1 له ۳۰ څخه/);
    assert.equal(sent[2].content.audio[0], 1);

    // د ۲۰:۰۰ له رسېدو وروسته، خو د اتومات خپرېدو تر ثبت مخکې هم نوی درس نه ښکاري.
    now = new Date('2026-11-11T20:01:00+04:30');
    await service.handleCommand({}, '12345-678@g.us', 'درس', {});
    assert.match(sent[3].content.text, /ورځ: 1 له ۳۰ څخه/);
    assert.equal(sent[5].content.audio[0], 1);

    // د ۱۰مې نېټې د له لاسه تېرېدو له امله ورځ ۳ نه خپرېږي؛ بل بریالی درس ورځ ۲ وي.
    const socket = {};
    await service.tick(() => socket, now);
    const progress = JSON.parse(fs.readFileSync(state.path, 'utf8'));
    assert.equal(progress.posts['2026-11-11@20:00'].day, 2);
    assert.equal(progress.posts['2026-11-11@20:00'].status, 'sent');
    assert.equal(progress.posts['2026-11-11@20:00'].audioStatus, 'sent');

    await service.handleCommand({}, '12345-678@g.us', 'درس', {});
    const latestLessonMessage = sent.filter((item) =>
      typeof item.content.text === 'string' && item.content.text.includes('ورځ: 2 له ۳۰ څخه')
    );
    assert.ok(latestLessonMessage.length >= 2);
    assert.deepEqual(generatedDays, [1, 2]);
    const audioMessages = sent.filter((item) => Buffer.isBuffer(item.content.audio));
    assert.equal(audioMessages[audioMessages.length - 1].content.audio[0], 2);
  } finally {
    state.cleanup();
  }
});

test('does not reveal the first lesson before its first scheduled publication', async () => {
  const state = temporaryState();
  try {
    const sent = [];
    const now = new Date('2026-11-11T19:59:00+04:30');
    const service = createEnglishCourseService({
      statePath: state.path,
      getNow: () => now,
      getEnv: () => ({ ENGLISH_COURSE_START_DATE: '2026-11-11' }),
      getConfig: () => ({ enabled: true, groupJid: '12345-678@g.us' }),
      safeSend: async (_socket, jid, content) => {
        sent.push({ jid, content });
        return { key: { id: 'sent' } };
      },
    });

    await service.handleCommand({}, '12345-678@g.us', 'درس', {});
    assert.match(sent[0].content.text, /لا نوی درس نه دی خپور شوی/);
    assert.equal(sent.length, 1);
  } finally {
    state.cleanup();
  }
});
