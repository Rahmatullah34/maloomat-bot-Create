'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMessageHandler } = require('../lib/message-handler');

function createHarness(overrides = {}) {
  const state = {
    sends: [],
    answers: [],
    deletions: [],
    remembered: [],
    burstCalls: 0,
    badWordCalls: 0,
    persistedLids: [],
  };
  const socket = { ev: {} };
  const dependencies = {
    socket,
    shouldHandleNotifyEvent: (type, msg) => type === 'notify' && Boolean(msg?.message && !msg.key?.fromMe),
    classifyRemoteJid: jid => String(jid || '').endsWith('@g.us') ? 'group' : 'private',
    isReactionMessage: () => false,
    isStickerMessage: () => false,
    ENABLE_PRIVATE_QA: true,
    PRIVATE_QA_ALLOWED_NUMBERS: new Set(),
    PRIVATE_QA_ALLOWED_LIDS: new Set(),
    PRIVATE_QA_OWNER_CLAIM_CODE: '',
    PRIVATE_QA_OWNER_CLAIMED: false,
    persistPrivateOwnerLid: async lid => { state.persistedLids.push(lid); },
    FULL_MODERATION_EXEMPT_PHONE_NUMBER: '',
    rememberMessage: () => true,
    extractText: () => 'د زړه دنده څه ده؟',
    extractQuestionFromImage: async (_msg, _socket, caption) => caption,
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

test('rejects unauthorized private chats without logging the sender identifier', async () => {
  const h = createHarness({
    classifyRemoteJid: () => 'private',
    PRIVATE_QA_ALLOWED_NUMBERS: new Set(),
    PRIVATE_QA_ALLOWED_LIDS: new Set(),
  });
  const savedLog = console.log;
  const savedWarn = console.warn;
  const logLines = [];
  console.log = (...args) => logLines.push(args.join(' '));
  console.warn = (...args) => logLines.push(args.join(' '));
  try {
    await h.handler({ type: 'notify', messages: [message('15551234567@s.whatsapp.net')] });
  } finally {
    console.log = savedLog;
    console.warn = savedWarn;
  }
  assert.equal(h.state.answers.length, 0);
  assert.equal(h.state.sends.length, 0);
  assert.ok(logLines.some(line => /شخصي چټ بند پاتې دی/.test(line)));
  assert.equal(logLines.some(line => line.includes('15551234567@s.whatsapp.net')), false);
});

test('allows a LID-only private sender only when that exact LID is owner-allowlisted', async () => {
  const senderLid = '123456789012345@lid';
  const owner = '15551234567';
  const h = createHarness({
    classifyRemoteJid: () => 'private',
    PRIVATE_QA_ALLOWED_NUMBERS: new Set([owner]),
    PRIVATE_QA_ALLOWED_LIDS: new Set(['123456789012345']),
    FULL_MODERATION_EXEMPT_PHONE_NUMBER: owner,
    extractText: () => 'دا ازمویښتي پوښتنه ده؟',
  });

  await h.handler({
    type: 'notify',
    messages: [message(senderLid, 'دا ازمویښتي پوښتنه ده؟', {
      key: { remoteJid: senderLid, id: 'test-message', participant: null, participantAlt: undefined, remoteJidAlt: undefined, fromMe: false },
    })],
  });

  assert.equal(h.state.answers.length, 1);
  assert.equal(h.state.answers[0][3], 'دا ازمویښتي پوښتنه ده؟');
});

test('claims and persists the owner LID with the one-time private claim code', async () => {
  const senderLid = '123456789012345@lid';
  const owner = '15551234567';
  const claimCode = 'MAL-OWNER-CLAIM-7KQ9-M4X2-P8VD-R6TN';
  const allowedLids = new Set();
  const h = createHarness({
    classifyRemoteJid: () => 'private',
    PRIVATE_QA_ALLOWED_NUMBERS: new Set([owner]),
    PRIVATE_QA_ALLOWED_LIDS: allowedLids,
    PRIVATE_QA_OWNER_CLAIM_CODE: claimCode,
    PRIVATE_QA_OWNER_CLAIMED: false,
    FULL_MODERATION_EXEMPT_PHONE_NUMBER: owner,
    extractText: () => claimCode.toLowerCase(),
  });

  await h.handler({
    type: 'notify',
    messages: [message(senderLid, claimCode, {
      key: { remoteJid: senderLid, id: 'owner-claim', participant: null, participantAlt: undefined, remoteJidAlt: undefined, fromMe: false },
    })],
  });

  assert.deepEqual(h.state.persistedLids, ['123456789012345']);
  assert.equal(allowedLids.has('123456789012345'), true);
  assert.equal(h.state.answers.length, 0);
  assert.equal(h.state.sends.length, 1);
  assert.match(h.state.sends[0].text, /شخصي چټ.*فعال شو/);
});

test('answers a private question only when its normalized phone is allowlisted', async () => {
  const h = createHarness({
    classifyRemoteJid: () => 'private',
    PRIVATE_QA_ALLOWED_NUMBERS: new Set(['15551234567']),
    FULL_MODERATION_EXEMPT_PHONE_NUMBER: '15551234567',
    extractText: () => 'دا ازمویښتي پوښتنه ده؟',
  });
  await h.handler({ type: 'notify', messages: [message('15551234567@s.whatsapp.net')] });
  assert.equal(h.state.answers.length, 1);
  assert.equal(h.state.answers[0][3], 'دا ازمویښتي پوښتنه ده؟');
  assert.equal(h.state.burstCalls, 0);
});

test('silently ignores an ordinary private image without a readable question', async () => {
  const owner = '15551234567';
  const h = createHarness({
    classifyRemoteJid: () => 'private',
    PRIVATE_QA_ALLOWED_NUMBERS: new Set([owner]),
    FULL_MODERATION_EXEMPT_PHONE_NUMBER: owner,
    extractText: () => '',
    extractQuestionFromImage: async () => '',
  });
  await h.handler({
    type: 'notify',
    messages: [message(owner + '@s.whatsapp.net', '', {
      message: { imageMessage: { mimetype: 'image/jpeg' } },
    })],
  });
  assert.equal(h.state.answers.length, 0);
  assert.equal(h.state.sends.length, 0);
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

test('keeps group moderation active for messages without a question mark', async () => {
  const h = createHarness({
    extractText: () => 'دا عادي متن دی، پوښتنه نه ده',
    containsBadWord: () => true,
  });
  await h.handler({
    type: 'notify',
    messages: [message('12345@g.us', 'دا عادي متن دی، پوښتنه نه ده')],
  });
  assert.equal(h.state.deletions.length, 1);
  assert.equal(h.state.answers.length, 0);
  assert.equal(h.state.sends.length, 0);
});

test('routes a regular allowed group question with its original message and mentionable sender JID', async () => {
  const h = createHarness();
  const original = message('12345@g.us');
  await h.handler({ type: 'notify', messages: [original] });
  assert.equal(h.state.burstCalls, 1);
  assert.equal(h.state.badWordCalls, 1);
  assert.equal(h.state.answers.length, 1);
  assert.equal(h.state.remembered.length, 1);
  assert.equal(h.state.answers[0][5].message, original);
  assert.equal(h.state.answers[0][5].mentionJid, '15551230000@s.whatsapp.net');
});

test('routes a question read from a group image into the normal answer engine', async () => {
  const photo = message('12345@g.us', '', {
    message: { imageMessage: { mimetype: 'image/jpeg' } },
  });
  const h = createHarness({
    extractText: () => '',
    extractQuestionFromImage: async (incoming, _socket, caption) => {
      assert.equal(incoming, photo);
      assert.equal(caption, '');
      return 'د عکس پوښتنه څه ده؟';
    },
  });

  await h.handler({ type: 'notify', messages: [photo] });
  assert.equal(h.state.answers.length, 1);
  assert.equal(h.state.answers[0][3], 'د عکس پوښتنه څه ده؟');
});

test('deletes a captionless Status image before the empty-image shortcut, even with sticker metadata', async () => {
  const statusPhoto = message('12345@g.us', '', {
    key: { id: 'status-photo' },
    message: {
      groupStatusMentionMessage: {},
      imageMessage: { mimetype: 'image/jpeg' },
      stickerMessage: { mimetype: 'image/webp' },
    },
  });
  let ocrCalls = 0;
  const h = createHarness({
    extractText: () => '',
    extractQuestionFromImage: async () => { ocrCalls += 1; return ''; },
    isWhatsAppStatusShare: incoming => incoming === statusPhoto,
    isStickerMessage: incoming => incoming === statusPhoto,
  });

  await h.handler({ type: 'notify', messages: [statusPhoto] });
  assert.equal(ocrCalls, 0, 'Status media should be classified before image OCR');
  assert.equal(h.state.deletions.length, 1);
  assert.equal(h.state.deletions[0][2], statusPhoto.key);
  assert.match(h.state.deletions[0][4], /Status/);
  assert.equal(h.state.burstCalls, 0);
  assert.equal(h.state.answers.length, 0);
});

test('ignores a standalone sticker without counting it as spam or sending it to AI', async () => {
  const sticker = message('12345@g.us', '', {
    key: { id: 'standalone-sticker' },
    message: { stickerMessage: { mimetype: 'image/webp' } },
  });
  const h = createHarness({
    extractText: () => '',
    isStickerMessage: incoming => incoming === sticker,
  });

  await h.handler({ type: 'notify', messages: [sticker] });
  assert.equal(h.state.deletions.length, 0);
  assert.equal(h.state.burstCalls, 0);
  assert.equal(h.state.answers.length, 0);
});

test('silently ignores a group image when it contains no readable question', async () => {
  const photo = message('12345@g.us', '', {
    message: { imageMessage: { mimetype: 'image/jpeg' } },
  });
  const h = createHarness({
    extractText: () => '',
    extractQuestionFromImage: async () => '',
  });

  await h.handler({ type: 'notify', messages: [photo] });
  assert.equal(h.state.answers.length, 0);
  assert.equal(h.state.sends.length, 0);
});

test('does not print private identifiers from the message handler source', () => {
  const handlerSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'message-handler.js'), 'utf8');
  assert.doesNotMatch(handlerSrc, /JID='\s*\+\s*groupJid/);
});

test('passes quoted WhatsApp reply context on every group follow-up', async () => {
  const h = createHarness({
    extractText: content => String(
      content?.extendedTextMessage?.text || content?.conversation || ''
    ).trim(),
  });
  const firstReply = message('12345@g.us', 'ولې؟', {
    key: { remoteJid: '12345@g.us', id: 'group-reply-1', participant: '15551230000@s.whatsapp.net', fromMe: false },
    message: {
      extendedTextMessage: {
        text: 'ولې؟',
        contextInfo: { quotedMessage: { conversation: 'د زړه دنده څه ده؟' } },
      },
    },
  });
  const secondReply = message('12345@g.us', 'دا څنګه کار کوي؟', {
    key: { remoteJid: '12345@g.us', id: 'group-reply-2', participant: '15551230000@s.whatsapp.net', fromMe: false },
    message: {
      extendedTextMessage: {
        text: 'دا څنګه کار کوي؟',
        contextInfo: { quotedMessage: { conversation: 'زړه وینه ټول بدن ته پمپ کوي.' } },
      },
    },
  });

  await h.handler({ type: 'notify', messages: [firstReply] });
  await h.handler({ type: 'notify', messages: [secondReply] });

  assert.equal(h.state.answers.length, 2);
  assert.equal(h.state.answers[0][3], 'ولې؟');
  assert.equal(h.state.answers[0][5].quotedText, 'د زړه دنده څه ده؟');
  assert.equal(h.state.answers[1][3], 'دا څنګه کار کوي؟');
  assert.equal(h.state.answers[1][5].quotedText, 'زړه وینه ټول بدن ته پمپ کوي.');
});

test('passes quoted WhatsApp reply context on every owner private-chat follow-up', async () => {
  const owner = '15551234567';
  const ownerLid = '123456789012345';
  const remoteJid = ownerLid + '@lid';
  const h = createHarness({
    PRIVATE_QA_ALLOWED_NUMBERS: new Set([owner]),
    PRIVATE_QA_ALLOWED_LIDS: new Set([ownerLid]),
    FULL_MODERATION_EXEMPT_PHONE_NUMBER: owner,
    extractText: content => String(
      content?.extendedTextMessage?.text || content?.conversation || ''
    ).trim(),
  });
  const makePrivateReply = (id, text, quotedText) => message(remoteJid, text, {
    key: {
      id,
      remoteJid,
      participant: null,
      participantAlt: undefined,
      remoteJidAlt: undefined,
    },
    message: {
      extendedTextMessage: {
        text,
        contextInfo: { quotedMessage: { conversation: quotedText } },
      },
    },
  });

  await h.handler({
    type: 'notify',
    messages: [makePrivateReply('private-reply-1', 'ولې؟', 'د زړه دنده څه ده؟')],
  });
  await h.handler({
    type: 'notify',
    messages: [makePrivateReply('private-reply-2', 'دا څنګه کار کوي؟', 'زړه وینه ټول بدن ته پمپ کوي.')],
  });

  assert.equal(h.state.answers.length, 2);
  assert.equal(h.state.answers[0][5].quotedText, 'د زړه دنده څه ده؟');
  assert.equal(h.state.answers[1][5].quotedText, 'زړه وینه ټول بدن ته پمپ کوي.');
});

