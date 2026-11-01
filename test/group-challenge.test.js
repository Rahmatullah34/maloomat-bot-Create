'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createGroupChallengeService,
  parseAnswer,
} = require('../lib/group-challenge');

function fixture(overrides = {}) {
  const sent = [];
  const service = createGroupChallengeService({
    generateQuestion: async () => ({
      question: 'د ځمکې طبیعي سپوږمکۍ څه نومېږي؟',
      options: { A: 'سپوږمۍ', B: 'لمر', C: 'مریخ', D: 'زهره' },
      answer: 'A',
      explanation: 'سپوږمۍ د ځمکې طبیعي سپوږمکۍ ده.',
    }),
    ...overrides,
  });
  const socket = {};
  const safeSend = async (_socket, jid, payload) => {
    sent.push({ jid, text: payload?.text || '' });
    return true;
  };
  const send = (text, senderId = 'member-1', isAdmin = false, senderName = 'غړی') =>
    service.handleGroupChallengeMessage({
      socket, jid: '12345@g.us', text, senderId, isAdmin, senderName, safeSend,
    });
  return { service, sent, send };
}

test('only a group admin can start a quiz', async () => {
  const h = fixture();
  assert.equal(await h.send('سیالي', 'member-1', false), true);
  assert.match(h.sent.at(-1).text, /یوازې د ګروپ مدیر/);
  assert.equal(h.service.active.size, 0);
});

test('admin starts a quiz; correct answers earn one point and duplicate answers are blocked', async () => {
  const h = fixture();
  await h.send('سیالي', 'admin-1', true, 'مدیر');
  assert.match(h.sent.at(-1).text, /علمي سیالي پیل شوه/);
  assert.equal(h.service.active.size, 1);

  await h.send('ځواب A', 'member-1', false, 'احمد');
  assert.match(h.sent.at(-1).text, /سم ځواب دې ورکړ/);
  await h.send('ځواب B', 'member-1', false, 'احمد');
  assert.match(h.sent.at(-1).text, /مخکې ځواب ورکړی/);

  await h.send('نمرې', 'member-2', false, 'بل غړی');
  assert.match(h.sent.at(-1).text, /احمد — 1 نمرې/);
});

test('wrong answer does not add a point', async () => {
  const h = fixture();
  await h.send('quiz', 'admin-1', true, 'مدیر');
  await h.send('ځواب C', 'member-1', false, 'بلال');
  assert.match(h.sent.at(-1).text, /دا ځل سم نه و/);
  assert.equal(h.service.scores.get('12345@g.us').get('member-1').points, 0);
});

test('answer parser accepts letter and numeric forms', () => {
  assert.equal(parseAnswer('ځواب A'), 'A');
  assert.equal(parseAnswer('ځواب ۱'), 'A');
  assert.equal(parseAnswer('ځواب 4'), 'D');
  assert.equal(parseAnswer('A'), '');
});
