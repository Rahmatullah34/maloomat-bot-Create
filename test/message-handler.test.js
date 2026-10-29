'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMessageHandler } = require('../lib/message-handler');

function createHarness(overrides = {}) {
  const state = {
    sends: [],
    answers: [],
    deletions: [],
    remembered: [],
    burstCalls: 0,
    badWordCalls: 0,
  };
  const socket = { ev: {} };
  const dependencies = {
    socket,
    shouldHandleNotifyEvent: (type, msg) => type === 'notify' && Boolean(msg?.message && !msg.key?.fromMe),
    classifyRemoteJid: jid => String(jid || '').endsWith('@g.us') ? 'group' : 'private',
    isReactionMessage: () => false,
    ENABLE_PRIVATE_QA: true,
    PRIVATE_QA_ALLOWED_NUMBERS: new Set(),
    PRIVATE_QA_ALLOWED_LIDS: new Set(),
    rememberMessage: () => true,
    extractText: () => 'د زړه دنده څه ده؟',
    safeSend: async (_socket, jid, payload) => { state.sends.push({ jid, text: payload?.text || '' }); return true; },
    answerWithKnowledge: async (...args) => { state.answers.push(args); return true; },
    isGroupAllowed: () => true,
    isForwardedChannelMessage: () => false,
    isWhatsAppStatusShare: () => false,
    isGroupRulesCommand: () => false,
    GROUP_RULES: 'د ازموینې قوانین',
    resolveGroupSender: async (_socket, _groupJid, identifiers) => ({
      isAdmin: false,
      participantKey: identifiers[0] || 'test-member',
      phoneNumber: '',
    }),
    isFullModerationExemptSender: () => false,
    WARNING_MUTE_ENABLED: false,
    getTemporaryMuteStatus: () => null,
    deleteGroupMessage: async (...args) => { state.deletions.push(args); },
    recordGroupMessage: () => {
      state.burstCalls += 1;
      return { count: 1, shouldWarn: false, markWarned() {} };
    },
    BURST_LIMIT: 3,
    containsBadWord: () => { state.badWordCalls += 1; return false; },
    ENABLE_LINK_MODERATION: false,
    LINK_PATTERN: /https?:\/\//i,
    isLinkPermittedForSender: async () => true,
    recordRepeatedMessage: () => ({ shouldDelete: false, shouldWarn: false }),
    rememberGroupMember: (...args) => { state.remembered.push(args); },
    ...overrides,
  };
  return { handler: createMessageHandler(dependencies), state, dependencies };
}

function message(remoteJid, text = 'د زړه دنده څه ده؟', extra = {}) {
  return {
    key: { remoteJid, id: 'test-message', participant: '15551230000@s.whatsapp.net', fromMe: false, ...extra.key },
    message: { conversation: text },
    pushName: 'ازموینه',
    ...extra,
  };
}

test('ignores history append events before processing any messages', async () => {
  const h = createHarness();
  await h.handler({ type: 'append', messages: [message('12345@g.us')] });
  assert.equal(h.state.answers.length, 0);
  assert.equal(h.state.burstCalls, 0);
});

test('ignores WhatsApp reactions before moderation or Q&A', async () => {
  const h = createHarness({ isReactionMessage: () => true });
  await h.handler({ type: 'notify', messages: [message('12345@g.us')] });
  assert.equal(h.state.answers.length, 0);
  assert.equal(h.state.burstCalls, 0);
});

test('rejects unauthorized private chats by default', async () => {
  const h = createHarness({
    classifyRemoteJid: () => 'private',
    PRIVATE_QA_ALLOWED_NUMBERS: new Set(),
    PRIVATE_QA_ALLOWED_LIDS: new Set(),
  });
  await h.handler({ type: 'notify', messages: [message('15551234567@s.whatsapp.net')] });
  assert.equal(h.state.answers.length, 0);
  assert.equal(h.state.sends.length, 0);
});

test('answers a private question only when its normalized phone is allowlisted', async () => {
  const h = createHarness({
    classifyRemoteJid: () => 'private',
    PRIVATE_QA_ALLOWED_NUMBERS: new Set(['15551234567']),
    extractText: () => 'دا ازمویښتي پوښتنه ده؟',
  });
  await h.handler({ type: 'notify', messages: [message('15551234567@s.whatsapp.net')] });
  assert.equal(h.state.answers.length, 1);
  assert.equal(h.state.answers[0][3], 'دا ازمویښتي پوښتنه ده؟');
  assert.equal(h.state.burstCalls, 0);
});

test('handles group-rules commands before burst, bad-word, and link moderation', async () => {
  const h = createHarness({ isGroupRulesCommand: () => true, extractText: () => 'قوانین' });
  await h.handler({ type: 'notify', messages: [message('12345@g.us')] });
  assert.equal(h.state.sends.length, 1);
  assert.match(h.state.sends[0].text, /د ازموینې قوانین/);
  assert.equal(h.state.burstCalls, 0);
  assert.equal(h.state.badWordCalls, 0);
  assert.equal(h.state.answers.length, 0);
});

test('routes a regular allowed group question through moderation then the answer engine', async () => {
  const h = createHarness();
  await h.handler({ type: 'notify', messages: [message('12345@g.us')] });
  assert.equal(h.state.burstCalls, 1);
  assert.equal(h.state.badWordCalls, 1);
  assert.equal(h.state.answers.length, 1);
  assert.equal(h.state.remembered.length, 1);
});
