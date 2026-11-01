'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createInnovationService,
  getAudioPayload,
  parseQuizAnswers,
} = require('../lib/innovation-service');

function harness(overrides = {}) {
  const sent = [];
  const quiz = {
    title: 'د ازموینې نمونه',
    questions: Array.from({ length: 5 }, (_, index) => ({
      question: 'پوښتنه ' + (index + 1),
      options: { A: 'الف', B: 'ب', C: 'ج', D: 'د' },
      answer: 'A',
      explanation: 'د سم ځواب تشریح',
    })),
  };
  const service = createInnovationService({
    searchInternet: async () => [
      { title: 'سرچینه ۱', provider: 'Example 1', url: 'https://example.com/one', snippet: 'معلومات ۱' },
      { title: 'سرچینه ۲', provider: 'Example 2', url: 'https://example.org/two', snippet: 'معلومات ۲' },
    ],
    generateLesson: async () => 'د درس نمونه',
    generateQuiz: async () => quiz,
    generateFactCheck: async () => ({
      status: 'supported',
      summary: 'د شته سرچینو له مخې ملاتړ لري.',
      evidence: 'دوې سرچینې ورته معلومات لري.',
      limitations: 'د بشپړ اصلي راپور لوستل لا هم ګټور دي.',
    }),
    generateBookReport: async () => 'د کتاب پېژندنه',
    generateLanguageLesson: async () => 'د ژبې لومړی درس',
    reviewLanguagePractice: async () => 'تمرین دې ښه و.',
    generateTechnicalHelp: async () => 'لومړی ګام: اپلیکیشن بیا پرانیزه.',
    generateSkillPlan: async () => 'د اوو ورځو پلان',
    generateDocument: async () => 'د سند مسوده',
    ...overrides,
  });
  const socket = {};
  const safeSend = async (_socket, jid, payload) => {
    sent.push({ jid, text: payload?.text || '' });
    return true;
  };
  const send = (text) => service.handlePrivateInnovationMessage({
    socket, jid: 'allowed-user@s.whatsapp.net', text, safeSend,
  });
  return { service, sent, send, quiz };
}

test('SERVICES opens the innovation menu', async () => {
  const h = harness();
  assert.equal(await h.send('SERVICES'), true);
  assert.match(h.sent.at(-1).text, /هوښیار ښوونکی/);
  assert.match(h.sent.at(-1).text, /د کتاب پېژندنه/);
  assert.match(h.sent.at(-1).text, /د اسنادو لیکونکی/);
});

test('quiz flow generates five questions and grades the learner response', async () => {
  const h = harness();
  await h.send('SERVICES');
  await h.send('2');
  assert.match(h.sent.at(-1).text, /امتحان/);
  await h.send('د ریاضي کسرونه');
  assert.match(h.sent.at(-1).text, /پوښتنه 1/);
  await h.send('1-A, 2-A, 3-B, 4-A, 5-A');
  assert.match(h.sent.at(-1).text, /د ازموینې پایله: 4\/5/);
});

test('CAREER is passed back to the existing career assistant', async () => {
  const h = harness();
  assert.equal(await h.send('CAREER'), false);
  assert.equal(h.sent.length, 0);
});

test('CANCEL clears an active innovation session', async () => {
  const h = harness();
  await h.send('SERVICES');
  await h.send('1');
  await h.send('CANCEL');
  assert.match(h.sent.at(-1).text, /لغوه شو/);
});

test('fact-check uses an explicit unverified result when there are too few sources', async () => {
  const h = harness({
    searchInternet: async () => [],
    generateFactCheck: async (_claim, sources) => {
      assert.equal(sources.length, 0);
      return {
        status: 'unverified',
        summary: 'د تایید لپاره سرچینې نشته.',
        evidence: '',
        limitations: 'د ادعا اصلي سرچینه نه ده موندل شوې.',
      };
    },
  });
  await h.send('SERVICES');
  await h.send('3');
  await h.send('دا خبر حقیقت لري؟');
  assert.match(h.sent.at(-1).text, /لا نه دی تایید شوی/);
});

test('quiz parser accepts Pashto digits and validates answer count', () => {
  assert.deepEqual(parseQuizAnswers('۱-A, ۲-B, ۳-C, ۴-D, ۵-A', 5), ['A', 'B', 'C', 'D', 'A']);
  assert.equal(parseQuizAnswers('1-A, 2-B', 5), null);
});

test('audio payload recognizer supports OGG and wrapped voice notes', () => {
  assert.deepEqual(getAudioPayload({
    ephemeralMessage: {
      message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 4 } },
    },
  }), { mimetype: 'audio/ogg; codecs=opus', seconds: 4 });
  assert.equal(getAudioPayload({ conversation: 'سلام' }), null);
});
