'use strict';

// د نظم ساتنې ازموینې — د بوټ په نه پیلولو سره ازمویږي.
// چلول: npm test

process.env.ALLOWED_GROUPS = '11111111111@g.us,22222222222@g.us';
process.env.ALLOWED_LINK_DOMAINS = 'example.com,bbc.com';
process.env.ALLOWED_LINK_SENDERS = '77777777777@s.whatsapp.net,2025550100@s.whatsapp.net,12025550100@s.whatsapp.net';

const fs = require('node:fs');
const path = require('node:path');

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isGroupAllowed,
  isHistoryCleanupEnabled,
  normalizePashto,
  hasMatchingPhoneNumber,
  isGroupRulesCommand,
  containsBadWord,
  LINK_PATTERN,
  isForwardedChannelMessage,
  isWhatsAppStatusShare,
  isReactionMessage,
  extractText,
  looksLikeQuestion,
  setTemporaryMute,
  getTemporaryMuteStatus,
  TEMPORARY_MUTE_DEFAULT_MS,
  rememberMessage,
  recordGroupMessage,
  recordRepeatedMessage,
  recordViolationWarning,
  shouldSendWarningNow,
  isLinkPermitted,
  findGroupParticipant,
  isGroupAdminParticipant,
  getCanonicalParticipantIdentifier,
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

test('hasMatchingPhoneNumber: د مالک شمېره په محلي/نړیوال PN بڼه پېژني، LID نه', () => {
  const owner = '0707285093';
  for (const identifier of [
    '0707285093@s.whatsapp.net',
    '93707285093@s.whatsapp.net',
    '93707285093:4@s.whatsapp.net',
    '707285093@s.whatsapp.net',
    '+93707285093',
    '0707285093',
  ]) {
    assert.equal(hasMatchingPhoneNumber([identifier], owner), true, identifier);
  }
  assert.equal(hasMatchingPhoneNumber(['707285093@lid'], owner), false);
  assert.equal(hasMatchingPhoneNumber(['99999999999@s.whatsapp.net'], owner), false);
});

test('isGroupRulesCommand: د قوانینو امر په پښتو/عربي لیکدود او نښو کې پېژني', () => {
  assert.equal(isGroupRulesCommand('قوانین'), true);
  assert.equal(isGroupRulesCommand('قانون'), true);
  assert.equal(isGroupRulesCommand('د ګروپ قوانین'), true);
  assert.equal(isGroupRulesCommand('قوانين'), true); // د عربي «ي» بڼه
  assert.equal(isGroupRulesCommand('قوانين!'), true);
  assert.equal(isGroupRulesCommand('rules'), true);
  assert.equal(isGroupRulesCommand('group rules'), true);
  assert.equal(isGroupRulesCommand('سلام، څنګه یې؟'), false);
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

test('isReactionMessage: لایکونه اخطار نه اخلي او نقل شوې محتوا غلط نه پېژندل کېږي', () => {
  assert.equal(
    isReactionMessage({ reactionMessage: { text: '❤️', key: { remoteJid: 'group@g.us', id: 'post-1' } } }),
    true
  );
  assert.equal(
    isReactionMessage({ ephemeralMessage: { message: { reactionMessage: { text: '👍' } } } }),
    true
  );
  assert.equal(
    isReactionMessage({ conversation: 'مننه، لایک مې درکړ', contextInfo: { quotedMessage: { reactionMessage: { text: '❤️' } } } }),
    false
  );
  assert.equal(isReactionMessage({ conversation: 'عادي پیغام' }), false);
});

test('looksLikeQuestion: د پای پوښتنیزه نښه لازمي ده', () => {
  assert.equal(looksLikeQuestion('دا څه دی؟'), true);
  assert.equal(looksLikeQuestion('د انسان د زړه دنده څه ده؟'), true);
  assert.equal(looksLikeQuestion('کله چې نبي کریم ﷺ جهاد ته تلو، زغره یې چا جوړه کړې وه؟'), true);
  assert.equal(looksLikeQuestion('د زغرې په اړه معلومات راکړه؟'), true);
  assert.equal(looksLikeQuestion('how does it work?'), true);
  assert.equal(looksLikeQuestion('دا څه دی?'), true);
  assert.equal(looksLikeQuestion('د انسان د زړه دنده څه ده'), false);
  assert.equal(looksLikeQuestion('کله چې نبي کریم ﷺ جهاد ته تلو، زغره یې چا جوړه کړې وه'), false);
  assert.equal(looksLikeQuestion('د زغرې په اړه معلومات راکړه'), false);
  assert.equal(looksLikeQuestion('how does it work'), false);
  assert.equal(looksLikeQuestion('دا پوښتنه؟ خو دلته نور متن شته'), false);
  assert.equal(looksLikeQuestion('سلام علیکم'), false);
  assert.equal(looksLikeQuestion('نن هوا ښه ده'), false);
  assert.equal(looksLikeQuestion('خلک وایي چې سبا باران دی'), false);
  assert.equal(looksLikeQuestion('کله چې زه ماشوم وم، هلته مې ژوند کاوه'), false);
});

test('temporary mute: د درېیم اخطار لپاره دوه ساعته محدودیت ساتي', () => {
  const group = 'test-mute@g.us';
  const user = 'temporary-member@s.whatsapp.net';
  assert.equal(TEMPORARY_MUTE_DEFAULT_MS, 2 * 60 * 60 * 1000);
  assert.equal(getTemporaryMuteStatus(group, user), null);

  const muted = setTemporaryMute(group, user, TEMPORARY_MUTE_DEFAULT_MS);
  assert.ok(muted && muted.expiresAt > Date.now());
  const status = getTemporaryMuteStatus(group, user);
  assert.ok(status && status.remainingMs > 0);
  assert.equal(getTemporaryMuteStatus('another-group@g.us', user), null);
});

test('temporary mute: ختم شوی محدودیت نور فعال نه پاتې کېږي', async () => {
  const group = 'test-mute-expiry@g.us';
  const user = 'temporary-expiry@s.whatsapp.net';
  setTemporaryMute(group, user, 25);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(getTemporaryMuteStatus(group, user), null);
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
  // د محرم ALLOWED_LINK_SENDERS تنظیم له لارې ټاکل شوي استوونکي اجازه لري؛ هیڅ شخصي شمېره په کوډ کې نه ساتل کېږي.
  assert.equal(isLinkPermitted('https://any-site.org/x', '2025550100@s.whatsapp.net'), true);
  assert.equal(isLinkPermitted('https://any-site.org/x', '12025550100@s.whatsapp.net'), true);
  // نامجاز لینک او نامجاز استوونکی
  assert.equal(isLinkPermitted('https://spam-site.net/offer', '99999999999@s.whatsapp.net'), false);
  // بې لینکه متن
  assert.equal(isLinkPermitted('دا عادي جمله ده', '99999999999@s.whatsapp.net'), false);
});

test('isGroupAdminSender: د LID، PN، phoneNumber او admin flags بدیلونه پېژني', () => {
  const participants = [
    {
      id: '987654321@lid',
      phoneNumber: '93707285093@s.whatsapp.net',
      admin: 'superadmin',
    },
    { id: '93700000001@s.whatsapp.net', isAdmin: true },
    { id: '93700000002@s.whatsapp.net', isSuperAdmin: true },
    { id: '123456789@lid', admin: null },
  ];

  assert.equal(isGroupAdminSender(participants, ['987654321@lid']), true);
  assert.equal(isGroupAdminSender(participants, ['0707285093@s.whatsapp.net']), true);
  assert.equal(isGroupAdminSender(participants, ['93707285093:4@s.whatsapp.net']), true);
  assert.equal(isGroupAdminSender(participants, ['93700000001:12@s.whatsapp.net']), true);
  assert.equal(isGroupAdminSender(participants, ['93700000002@s.whatsapp.net']), true);
  assert.equal(isGroupAdminSender(participants, ['123456789@lid']), false);
  assert.equal(isGroupAdminSender(participants, ['unknown@lid']), false);
  assert.equal(isGroupAdminSender(participants, []), false);
});

test('د PN/LID بدیلونه د سپم شمېر او اخطار لپاره یو ثابت کلید ورکوي', () => {
  const participants = [{
    id: '987654321@lid',
    phoneNumber: '93707285093@s.whatsapp.net',
    admin: 'admin',
  }];

  const keyFromLid = getCanonicalParticipantIdentifier(participants, ['987654321@lid']);
  const keyFromPhone = getCanonicalParticipantIdentifier(participants, ['93707285093@s.whatsapp.net']);
  const keyFromBoth = getCanonicalParticipantIdentifier(participants, [
    '987654321@lid',
    '93707285093@s.whatsapp.net',
  ]);

  assert.equal(keyFromLid, keyFromPhone);
  assert.equal(keyFromPhone, keyFromBoth);
  assert.equal(findGroupParticipant(participants, ['987654321@lid'])?.admin, 'admin');
  assert.equal(isGroupAdminParticipant(findGroupParticipant(participants, ['987654321@lid'])), true);
});
test('تایید شوی اډمین د چټک او تکراري سپم له اخطار/حذف څخه معاف دی', () => {
  const indexSrc = fs.readFileSync(
    path.join(__dirname, '..', 'index.js'),
    'utf8'
  );
  assert.match(indexSrc, /async function resolveGroupSender\s*\(/,
    'اډمین باید د WhatsApp د ګروپ metadata له مخې وپېژندل شي');
  assert.match(indexSrc, /if\s*\(!isSenderGroupAdmin && !isFullModerationExempt\)\s*\{\s*const burst = recordGroupMessage/,
    'د چټک سپم حد باید یوازې پر عادي غړو تطبیق شي');
  assert.match(indexSrc, /if\s*\(!isSenderGroupAdmin && !isFullModerationExempt\)\s*\{\s*const repeated = recordRepeatedMessage/,
    'د تکراري سپم حذف باید یوازې پر عادي غړو تطبیق شي');
});

test('د پوښتنو ځوابونه، انټرنېټي لټون او AI لنډیز د مرکزي تنظیماتو له مخې فعال دي', () => {
  const { loadRuntimeConfig } = require('../lib/runtime-config');
  const { buildHealthPayload } = require('../lib/health');
  const config = loadRuntimeConfig({});
  assert.equal(config.features.groupQA, true);
  assert.equal(config.features.privateQA, true);
  assert.equal(config.features.internetSearch, true);
  assert.equal(config.features.aiSummarization, true);
  assert.equal(config.features.linkModeration, true);

  const health = buildHealthPayload({
    runtimeConfig: config,
    whatsappConnectionState: 'connected',
    authSessionSaved: true,
    aiKeyConfigured: true,
  });
  assert.equal(health.webSearch, true);
  assert.equal(health.aiSummarization, true);
});


test('د قوانینو امر د سپم او نورو moderation فلټرونو تر مخه اداره کېږي', () => {
  const indexSrc = fs.readFileSync(
    path.join(__dirname, '..', 'index.js'),
    'utf8'
  );
  const rulesCommandPosition = indexSrc.indexOf('if (isGroupRulesCommand(text))');
  const burstCheckPosition = indexSrc.indexOf('const burst = recordGroupMessage');
  const badWordCheckPosition = indexSrc.indexOf('containsBadWord(text)', rulesCommandPosition);
  const linkCheckPosition = indexSrc.indexOf('LINK_PATTERN.test(text)', rulesCommandPosition);

  assert.ok(rulesCommandPosition >= 0, 'د قوانینو امر باید موجود وي');
  assert.ok(rulesCommandPosition < burstCheckPosition, 'د قوانینو امر باید د سپم شمېر تر مخه وي');
  assert.ok(rulesCommandPosition < badWordCheckPosition, 'د قوانینو امر باید د کنځلو فلټر تر مخه وي');
  assert.ok(rulesCommandPosition < linkCheckPosition, 'د قوانینو امر باید د لینک فلټر تر مخه وي');
  assert.match(indexSrc, /isGroupRulesCommand\(text\)/);
});

test('د نظم د معافیت شمېره له محرمو تنظیماتو لوستل کېږي', () => {
  const indexSrc = fs.readFileSync(
    path.join(__dirname, '..', 'index.js'),
    'utf8'
  );
  const { loadRuntimeConfig } = require('../lib/runtime-config');
  const configured = loadRuntimeConfig({ FULL_MODERATION_EXEMPT_PHONE_NUMBER: '+1 (202) 555-0100' });
  assert.equal(configured.security.fullModerationExemptPhoneNumber, '12025550100');
  assert.equal(loadRuntimeConfig({}).security.fullModerationExemptPhoneNumber, '');

  assert.match(indexSrc, /runtimeConfig\.security\.fullModerationExemptPhoneNumber/);
  assert.match(indexSrc, /function isFullModerationExemptSender\(senderIdentifiers\)/);
  assert.match(indexSrc, /!isFullModerationExempt\s*\?\s*getTemporaryMuteStatus/);
  assert.match(indexSrc, /if \(statusShare && !isFullModerationExempt\)/);
  assert.match(indexSrc, /if \(channelForward && !isFullModerationExempt\)/);
  assert.match(indexSrc, /if \(!isSenderGroupAdmin && !isFullModerationExempt\) \{\s*const burst = recordGroupMessage/);
  assert.match(indexSrc, /if \(!isFullModerationExempt && containsBadWord\(text\)\)/);
  assert.match(indexSrc, /ENABLE_LINK_MODERATION &&\s*!isFullModerationExempt &&\s*LINK_PATTERN\.test\(text\)/);
  assert.match(indexSrc, /if \(!isSenderGroupAdmin && !isFullModerationExempt\) \{\s*const repeated = recordRepeatedMessage/);
  assert.match(indexSrc, /if \(historySenderIsExempt\) continue/);
});

test('د لینکونو بندیز د مرکزي تنظیماتو له مخې فعال دی؛ شخصي استثنا په کوډ کې نه ده لیکل شوې', () => {
  const indexSrc = fs.readFileSync(
    path.join(__dirname, '..', 'index.js'),
    'utf8'
  );
  const moderationSrc = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'moderation.js'),
    'utf8'
  );
  const { loadRuntimeConfig } = require('../lib/runtime-config');
  const { buildHealthPayload } = require('../lib/health');

  const config = loadRuntimeConfig({});
  assert.equal(config.features.linkModeration, true);
  assert.equal(buildHealthPayload({ runtimeConfig: config }).moderation.links, true);
  assert.doesNotMatch(moderationSrc, /DEFAULT_ALLOWED_LINK_SENDERS/);
  assert.match(indexSrc, /const hasLink = ENABLE_LINK_MODERATION && LINK_PATTERN\.test\(text\)/);
  assert.match(indexSrc, /ENABLE_LINK_MODERATION\s*&&\s*LINK_PATTERN\.test\(text\)/);
  assert.match(indexSrc, /containsBadWord\(text\)/);
  assert.match(indexSrc, /recordRepeatedMessage\(groupJid, stableParticipantJid, text\)/);
  assert.match(indexSrc, /if \(isReactionMessage\(msg\.message\)\)/,
    'د WhatsApp لایکونه باید د عادي ګروپي نظم او اخطارونو له شمېر څخه وایستل شي');
});

test('WhatsApp connection settings keep a live socket and expose session diagnostics', () => {
  const indexSrc = fs.readFileSync(
    path.join(__dirname, '..', 'index.js'),
    'utf8'
  );

  const healthSrc = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'health.js'),
    'utf8'
  );
  assert.match(indexSrc, /keepAliveIntervalMs:\s*20_000/);
  assert.match(indexSrc, /connectTimeoutMs:\s*60_000/);
  assert.match(indexSrc, /defaultQueryTimeoutMs:\s*60_000/);
  assert.match(indexSrc, /saveCreds\(\)\.catch/);
  assert.match(indexSrc, /whatsappLastDisconnectCode/);
  assert.match(indexSrc, /authSessionSaved:\s*fs\.existsSync/);
  assert.match(indexSrc, /sessionResetRequested/);
  assert.match(healthSrc, /whatsappLastDisconnectCode/);
  assert.match(healthSrc, /authSessionSaved/);
});
