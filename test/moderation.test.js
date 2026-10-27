'use strict';

// د نظم ساتنې ازموینې — د بوټ په نه پیلولو سره ازمویږي.
// چلول: npm test

process.env.ALLOWED_GROUPS = '11111111111@g.us,22222222222@g.us';
process.env.ALLOWED_LINK_DOMAINS = 'example.com,bbc.com';
process.env.ALLOWED_LINK_SENDERS = '77777777777@s.whatsapp.net';

const fs = require('node:fs');
const path = require('node:path');

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
  isLinkPermitted,
  isGroupAdminSender,
  BAD_WORDS,
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

test('BAD_WORDS: اصلي لېست بشپړ دی (regression)', () => {
  // دا کلمې په یوې سمونې کې په غلطۍ سره له لېست پاتې شوې وې؛ نور باید هیڅکله نه ویښي.
  for (const word of ['حرامي', 'کوس', 'خره', 'گاو', 'کثافت', 'آشغال', 'گم شو', 'گمشو']) {
    assert.ok(BAD_WORDS.includes(word), `د لېست پاتې کلمه: ${word}`);
  }
  assert.ok(BAD_WORDS.length >= 77, 'د لېست اندازه باید له ۷۷ کمه نه وي');
});

test('isLinkPermitted: اجازې لرونکي لینکونه او استوونکي', () => {
  // اجازې لرونکی ډومېن
  assert.equal(isLinkPermitted('ګوره https://example.com/page', '99999999999@s.whatsapp.net'), true);
  assert.equal(isLinkPermitted('ګوره https://www.bbc.com/news', '99999999999@s.whatsapp.net'), true);
  // اجازې لرونکی استوونکی (لکه مدیر)
  assert.equal(isLinkPermitted('https://any-site.org/x', '77777777777@s.whatsapp.net'), true);
  // د بوټ د اډمین شمېرې محلي او نړیوال WhatsApp شکلونه دواړه اجازه لري.
  assert.equal(isLinkPermitted('https://any-site.org/x', '0707285093@s.whatsapp.net'), true);
  assert.equal(isLinkPermitted('https://any-site.org/x', '93707285093@s.whatsapp.net'), true);
  // نامجاز لینک او نامجاز استوونکی
  assert.equal(isLinkPermitted('https://spam-site.net/offer', '99999999999@s.whatsapp.net'), false);
  // بې لینکه متن
  assert.equal(isLinkPermitted('دا عادي جمله ده', '99999999999@s.whatsapp.net'), false);
});

test('isGroupAdminSender: د LID، PN او phoneNumber بدیلونه پېژني', () => {
  const participants = [
    {
      id: '987654321@lid',
      phoneNumber: '+93 707 285 093',
      admin: 'superadmin',
    },
    { id: '93700000001@s.whatsapp.net', admin: 'admin' },
    { id: '123456789@lid', admin: null },
  ];

  // مستقیم LID او د همدې اډمین د افغانستان محلي/نړیوال نمبر دواړه باید ومنل شي.
  assert.equal(isGroupAdminSender(participants, ['987654321@lid']), true);
  assert.equal(isGroupAdminSender(participants, ['0707285093@s.whatsapp.net']), true);
  assert.equal(isGroupAdminSender(participants, ['93707285093:4@s.whatsapp.net']), true);
  // د PN device suffix هم باید برابر شي.
  assert.equal(isGroupAdminSender(participants, ['93700000001:12@s.whatsapp.net']), true);

  // عادي غړی او ناپېژندل شوې پېژندپاڼه اډمین نه ګڼل کېږي.
  assert.equal(isGroupAdminSender(participants, ['123456789@lid']), false);
  assert.equal(isGroupAdminSender(participants, ['unknown@lid']), false);
  assert.equal(isGroupAdminSender(participants, []), false);
});

test('تایید شوی اډمین د چټک او تکراري سپم له اخطار/حذف څخه معاف دی', () => {
  const indexSrc = fs.readFileSync(
    path.join(__dirname, '..', 'index.js'),
    'utf8'
  );
  assert.match(indexSrc, /async function isGroupAdminMessage\s*\(/,
    'اډمین باید د WhatsApp د ګروپ metadata له مخې وپېژندل شي');
  assert.match(indexSrc, /if\s*\(!isSenderGroupAdmin\)\s*\{\s*const burst = recordGroupMessage/,
    'د چټک سپم حد باید یوازې پر عادي غړو تطبیق شي');
  assert.match(indexSrc, /if\s*\(!isSenderGroupAdmin\)\s*\{\s*const repeated = recordRepeatedMessage/,
    'د تکراري سپم حذف باید یوازې پر عادي غړو تطبیق شي');
});

test('د پوښتنو ځوابونه، انټرنېټي لټون او AI لنډیز موقتي بند دي', () => {
  const indexSrc = fs.readFileSync(
    path.join(__dirname, '..', 'index.js'),
    'utf8'
  );
  assert.match(indexSrc, /ENABLE_GROUP_QA\s*=\s*false/,
    'د پوښتنو او ځوابونو برخه باید بنده وي');
  assert.match(indexSrc, /ENABLE_INTERNET_SEARCH\s*=\s*false/,
    'انټرنېټي لټون باید بنده وي');
  assert.match(indexSrc, /ENABLE_AI_SUMMARIZATION\s*=\s*false/,
    'د AI لنډیز باید بنده وي');
  assert.match(indexSrc, /webSearch:\s*ENABLE_GROUP_QA\s*&&\s*ENABLE_INTERNET_SEARCH/,
    'د روغتیا راپور باید د انټرنېټ لټون غیرفعال وښيي');
});
