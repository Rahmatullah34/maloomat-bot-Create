'use strict';

// د نظم ساتنې ازموینې — د بوټ په نه پیلولو سره ازمویږي.
// چلول: npm test

process.env.ALLOWED_GROUPS = '11111111111@g.us,22222222222@g.us';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isGroupAllowed,
  isHistoryCleanupEnabled,
  normalizePashto,
  containsBadWord,
  LINK_PATTERN,
  isForwardedChannelMessage,
  isWhatsAppStatusShare,
  extractText,
  looksLikeQuestion,
  rememberMessage,
  recordGroupMessage,
  recordRepeatedMessage,
  recordViolationWarning,
  shouldSendWarningNow,
} = require('../lib/moderation');

test('isGroupAllowed: یوازې ټاکل شوي ګروپونه', () => {
  assert.equal(isGroupAllowed('11111111111@g.us'), true);
  assert.equal(isGroupAllowed('22222222222@g.us'), true);
  assert.equal(isGroupAllowed('99999999999@g.us'), false);
});

test('isHistoryCleanupEnabled: ډیفالټ پرانیستی', () => {
  assert.equal(isHistoryCleanupEnabled(), true);
});

test('normalizePashto: عربي تورې او نښانې سموي', () => {
  assert.equal(normalizePashto('كتاب يى'), 'کتاب یی');
  assert.equal(normalizePashto('سلام! ؟'), 'سلام');
  assert.equal(normalizePashto(''), '');
});

test('containsBadWord: سپکاوی نیسي، عادي کلمې نه', () => {
  assert.equal(containsBadWord('دا احمق دی'), true);
  assert.equal(containsBadWord('you idiot!'), true);
  assert.equal(containsBadWord('دا کتاب ښه دی'), false);
  assert.equal(containsBadWord(''), false);
});

test('LINK_PATTERN: لینکونه نیسي، عادي متن نه', () => {
  assert.equal(LINK_PATTERN.test('ګوره https://example.com/page'), true);
  assert.equal(LINK_PATTERN.test('www.example.com'), true);
  assert.equal(LINK_PATTERN.test('wa.me/93700000000'), true);
  assert.equal(LINK_PATTERN.test('دا عادي جمله ده'), false);
});

test('extractText: له بېلابیلو پیغامونو متن باسي', () => {
  assert.equal(extractText({ conversation: 'سلام' }), 'سلام');
  assert.equal(extractText({ extendedTextMessage: { text: 'لینک' } }), 'لینک');
  assert.equal(extractText({ imageMessage: { caption: 'انځور' } }), 'انځور');
  assert.equal(
    extractText({ viewOnceMessage: { message: { conversation: 'یو ځل' } } }),
    'یو ځل'
  );
  assert.equal(extractText({}), '');
});

test('isForwardedChannelMessage: اصلي پیغام نیسي، نقل شوې برخه نه', () => {
  // اصلي چینل فارورډ
  assert.equal(
    isForwardedChannelMessage({
      message: { conversation: 'x', forwardedNewsletterMessageInfo: { newsletterJid: 'n@newsletter' } },
    }),
    true
  );
  // غبرګون (reply) چې یوازې د نقل شوې برخې دننه چینل مېټاډاټا لري — غلط نه نیسي
  assert.equal(
    isForwardedChannelMessage({
      message: {
        conversation: 'غبرګون',
        contextInfo: {
          quotedMessage: { forwardedNewsletterMessageInfo: { newsletterJid: 'n@newsletter' } },
        },
      },
    }),
    false
  );
});

test('isWhatsAppStatusShare: اصلي Status نیسي، نقل شوې برخه نه', () => {
  assert.equal(
    isWhatsAppStatusShare({ message: { statusMentionMessage: {} } }),
    true
  );
  assert.equal(
    isWhatsAppStatusShare({
      message: {
        conversation: 'غبرګون',
        contextInfo: { quotedMessage: { statusMentionMessage: {} } },
      },
    }),
    false
  );
});

test('looksLikeQuestion: پوښتنې پېژني، عادي جمله نه', () => {
  assert.equal(looksLikeQuestion('دا څه دی؟'), true);
  assert.equal(looksLikeQuestion('سلام علیکم'), false);
  assert.equal(looksLikeQuestion('how does it work'), true);
});

test('rememberMessage: تکراري آی‌ډي بېرته نه مني', () => {
  assert.equal(rememberMessage('group1:msg1'), true);
  assert.equal(rememberMessage('group1:msg1'), false);
});

test('recordGroupMessage: په ۳۰ ثانیو کې ډېر پیغامونه سپم دي', () => {
  const jid = 'test-burst@g.us';
  const user = '33333333333@s.whatsapp.net';
  let last;
  for (let i = 0; i < 4; i += 1) {
    last = recordGroupMessage(jid, user);
  }
  assert.equal(last.count, 4);
  assert.equal(last.shouldWarn, true);
});

test('recordRepeatedMessage: درېم تکرار حذفیږي', () => {
  const jid = 'test-repeat@g.us';
  const user = '44444444444@s.whatsapp.net';
  const text = 'دا یو اوږد پیغام دی چې تکراریږي';
  let result;
  for (let i = 0; i < 3; i += 1) {
    result = recordRepeatedMessage(jid, user, text);
  }
  assert.equal(result.shouldDelete, true);
});

test('shouldSendWarningNow: دویم اخطار په ۳۰ ثانیو کې نه استوي', () => {
  const jid = 'test-warn@g.us';
  const user = '55555555555@s.whatsapp.net';
  assert.equal(shouldSendWarningNow(jid, user), true);
  assert.equal(shouldSendWarningNow(jid, user), false);
});

test('recordViolationWarning: شمېر لوړیږي', () => {
  const jid = 'test-violation@g.us';
  const user = '66666666666@s.whatsapp.net';
  assert.equal(recordViolationWarning(jid, user), 1);
  assert.equal(recordViolationWarning(jid, user), 2);
});
