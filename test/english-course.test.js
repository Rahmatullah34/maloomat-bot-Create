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
    assert.match(service.formatPractice(1), /د انګلیسي تمرین/);
    assert.match(service.formatQuiz(7), /د اونۍ ازموینه/);
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
    fs.writeFileSync(state.path, JSON.stringify({
      version: 1,
      startDate: today,
      posts: {},
      progress: {},
    }));
    const sent = [];
    const service = createEnglishCourseService({
      statePath: state.path,
      getConfig: () => ({ enabled: true, groupJid: '12345-678@g.us' }),
      safeSend: async (_socket, jid, content) => {
        sent.push({ jid, text: content.text });
        return { key: { id: 'sent' } };
      },
    });

    const wrongGroup = await service.handleCommand({}, '99999-888@g.us', 'درس', {});
    assert.equal(wrongGroup, false);

    const handled = await service.handleCommand({}, '12345-678@g.us', 'ځواب: 1 - Good morning', {
      participantKey: '15551234567@s.whatsapp.net',
      name: 'زده‌کوونکی',
    });
    assert.equal(handled, true);
    assert.match(sent[0].text, /ځواب مو سم دی/);
    assert.match(sent[0].text, /نمرې: 1/);

    const duplicate = await service.handleCommand({}, '12345-678@g.us', 'ځواب: 1 - Good morning', {
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

test('posts the first lesson once at 20:00 Kabul time and will not duplicate it', async () => {
  const state = temporaryState();
  try {
    const sent = [];
    const service = createEnglishCourseService({
      statePath: state.path,
      getConfig: () => ({ enabled: true, groupJid: '12345-678@g.us' }),
      safeSend: async (_socket, jid, content) => {
        sent.push({ jid, text: content.text });
        return { key: { id: 'scheduled-message' } };
      },
    });
    const getSocket = () => ({ sendMessage: async () => ({ key: { id: 'unused' } }) });
    const scheduled = new Date('2026-11-10T15:34:00.000Z');

    await service.tick(getSocket, scheduled);
    await service.tick(getSocket, scheduled);

    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /ورځ: 1 له ۳۰ څخه/);
    const progress = JSON.parse(fs.readFileSync(state.path, 'utf8'));
    assert.equal(progress.startDate, '2026-11-10');
    assert.equal(progress.posts['2026-11-10@20:00'].status, 'sent');
  } finally {
    state.cleanup();
  }
});
