'use strict';

const fs = require('fs');
const path = require('path');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const P = require('pino');
const express = require('express');
const { classifyRemoteJid, shouldHandleNotifyEvent } = require('./lib/message-router');
const { runtimeConfig, readOpenRouterApiKey } = require('./lib/runtime-config');
const { buildHealthPayload } = require('./lib/health');
const { createAnswerEngine } = require('./lib/answer-engine');
const {
  searchInternet,
  requestsInternetSearch,
  isTimeSensitiveQuestion,
  summarizeSourcesInPashto,
  formatVerifiedSourceLinks,
  formatInternetResults,
} = require('./lib/research-engine');
const { buildAnswerPlan } = require('./lib/answer-plan');
const { requiresFactualSourceEvidence, filterAuthoritativeFactualSources } = require('./lib/factual-source-policy');
const { isTafsirYaseerAuthorshipQuestion, filterTafsirYaseerAuthorSources } = require('./lib/book-source-policy');
const { splitWhatsAppText } = require('./lib/answer-delivery');
const { isCryptoEducationQuestion } = require('./lib/crypto-question');
const {
  filterTrustedReligiousSources,
  hasTrustedReligiousReferenceText,
  requiresAuthoritativeReligiousSource,
  asksForReligiousReferences,
} = require('./lib/religious-source-policy');
const { buildVerifiedQuranLongestWordAnswer } = require('./lib/quran-text-policy');
const { startAutoPublisher, getAutoPublisherStatus } = require('./lib/auto-publisher');

// د نظم ساتنې خالصې کړنې او حالت له جلا ماډول اخیستل کیږي
// (lib/moderation.js) څو په ازموینو کې و ازمویل شي.
const {
  isGroupAllowed,
  allowedGroupsCount,
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
  rememberMessage,
  recordGroupMessage,
  recordRepeatedMessage,
  BURST_LIMIT,
  recordViolationWarning,
  shouldSendWarningNow,
  looksLikeQuestion,
  setTemporaryMute,
  getTemporaryMuteStatus,
  isLinkPermitted,
  findGroupParticipant,
  isGroupAdminParticipant,
  getCanonicalParticipantIdentifier,
  isGroupAdminSender,
} = require('./lib/moderation');

// د WhatsApp د اتصال ریښتیایي حالت؛ د /health په ځواب کې ښودل کیږي.
let whatsappConnectionState = 'unknown';
let whatsappLastDisconnectCode = null;
let whatsappLastDisconnectAt = null;

// ======================================================
// 1. د بوټ HTTP روغتیا او حالت
// ======================================================

// د ټولو Runtime تنظیماتو سرچینه: lib/runtime-config.js.
const ENABLE_GROUP_QA = runtimeConfig.features.groupQA;
const ENABLE_PRIVATE_QA = runtimeConfig.features.privateQA;
const ENABLE_INTERNET_SEARCH = runtimeConfig.features.internetSearch;
const ENABLE_AI_SUMMARIZATION = runtimeConfig.features.aiSummarization;
const ENABLE_LINK_MODERATION = runtimeConfig.features.linkModeration;
const PRIVATE_QA_ALLOWED_NUMBERS = runtimeConfig.security.privateQaAllowedNumbers;
const PRIVATE_QA_ALLOWED_LIDS = runtimeConfig.security.privateQaAllowedLids;
const FULL_MODERATION_EXEMPT_PHONE_NUMBER = runtimeConfig.security.fullModerationExemptPhoneNumber;

function isFullModerationExemptSender(senderIdentifiers) {
  return Boolean(FULL_MODERATION_EXEMPT_PHONE_NUMBER) &&
    hasMatchingPhoneNumber(senderIdentifiers, FULL_MODERATION_EXEMPT_PHONE_NUMBER);
}

const WARNING_MUTE_ENABLED = runtimeConfig.warningMute.enabled;
const WARNING_MUTE_DURATION_MINUTES = runtimeConfig.warningMute.durationMinutes;
const WARNING_MUTE_DURATION_MS = runtimeConfig.warningMute.durationMs;

const app = express();

app.get('/', (_req, res) => {
  res.status(200).send(
    '🌐 Maloomat AI | معلومات AI — WhatsApp Group Moderation Bot'
  );
});

app.get('/health', (_req, res) => {
  res.status(200).json(buildHealthPayload({
    runtimeConfig,
    whatsappConnectionState,
    whatsappLastDisconnectCode,
    whatsappLastDisconnectAt,
    reconnectScheduled: Boolean(reconnectTimer),
    authSessionSaved: fs.existsSync(path.join(AUTH_DIR, 'creds.json')),
    sessionResetRequested: runtimeConfig.whatsapp.resetSessionRequested,
    sessionResetMarkerPresent: fs.existsSync(RESET_MARKER),
    allowedGroups: allowedGroupsCount(),
    historyCleanup: isHistoryCleanupEnabled(),
    autoPublishing: getAutoPublisherStatus(),
    aiKeyConfigured: Boolean(readOpenRouterApiKey()),
    knowledgeEntries: OFFLINE_KNOWLEDGE.length,
  }));
});

app.get('/keepalive', (_req, res) => {
  res.status(200).json({ ok: true, service: 'maloomat-bot' });
});

app.listen(
  runtimeConfig.serverPort,
  '0.0.0.0',
  () => {
    console.log('✅ د بوټ د روغتیا HTTP خدمت فعال شو.');
  }
);

// د WhatsApp ناسته یوازې په محلي فایلونو کې ساتل کېږي.
async function getWhatsAppAuthState() {
  prepareAuthSessionForOneTimeReset();
  return useMultiFileAuthState(AUTH_DIR);
}

// ======================================================
// 1.5 د محلي معلوماتو او پوښتنو ځانګړنې؛ د لټون/ځواب انجنونه په جلا lib ماډولونو کې دي.
// ======================================================

// ثابت معلومات د بوټ په کوډ کې ساتل کېږي.
const OFFLINE_KNOWLEDGE = [];

// د کره‌والي اصلاح: د لمریز نظام په اړه مفصل او تازه علمي ځواب.
const SOLAR_SYSTEM_CORRECTION = {
  title: 'لمریز نظام',
  keywords: [
    'لمریز نظام', 'سیارې څو دي', 'د شمسي نظام سیارې', 'نهه سیارې',
    'اته سیارې', 'پلوټو', 'پلوتو', 'لمریز نظام کې څو سیارې دي',
    'د پلوټو سیاره', 'د شمسي نظام معلومات'
  ],
  answer: 'لمریز نظام د لمر او هغو اجرامو مجموعه ده چې د لمر د جاذبې له امله یې شاوخوا ګرځي. د اوسني رسمي ستورپوهنیز تعریف له مخې په لمریز نظام کې ۸ سیارې دي، د لمر له نږدې څخه تر لرې پورې: ۱) عطارد، ۲) زهره، ۳) ځمکه، ۴) مریخ، ۵) مشتري، ۶) زحل، ۷) اورانوس او ۸) نیپټون. پخوا پلوټو نهمه سیاره ګڼل کېده، خو په ۲۰۰۶ کال کې د نړیوالې ستورپوهنې اتحادیې د تعریف له مخې د «کوچنۍ سیارې» (Dwarf Planet) په توګه بیا طبقه‌بندي شوه. لامل یې دا دی چې پلوټو د خپل مدار شاوخوا سیمه د ورته اندازې نورو اجرامو څخه په بشپړه توګه نه ده پاکه کړې. پلوټو لا هم د لمریز نظام یو مهم کوچنی سیاره‌يي جرم دی او د نیپټون هاخوا د کویپر په کمربند کې موقعیت لري. نو د پخواني حساب له مخې خلک ۹ سیارې یادوي، خو د اوسني رسمي معیار له مخې ۸ سیارې دي. لمریز نظام یوازې له لمر او سیارو نه جوړېږي؛ د سیارو سپوږمۍ، کوچنۍ سیارې، لکۍ لرونکي ستوري، شهاب‌ډوله اجرام، دوړې او نورې کوچنۍ ذرې هم پکې شته.',
  source: 'NASA: https://science.nasa.gov/solar-system/planets/'
};
const solarSystemEntry = OFFLINE_KNOWLEDGE.find(item => item.title === SOLAR_SYSTEM_CORRECTION.title);
if (solarSystemEntry) Object.assign(solarSystemEntry, SOLAR_SYSTEM_CORRECTION);
else OFFLINE_KNOWLEDGE.push(SOLAR_SYSTEM_CORRECTION);

// د DNA په اړه مفصل او کره علمي ځواب.
const DNA_CORRECTION = {
  title: 'ډي‌اکسي رایبو نیوکلیک اسید (DNA)',
  keywords: [
    'DNA', 'ډي اکسي رایبو نیوکلیک اسید', 'ډي‌اکسي رایبو نیوکلیک اسید',
    'deoxyribonucleic acid', 'د وراثت ماده', 'جنیټیک معلومات',
    'جینونه څه دي', 'DNA څه شی دی', 'د انسان DNA', 'د ډي ان اې جوړښت'
  ],
  answer: 'DNA د Deoxyribonucleic Acid لنډ نوم دی. دا مالیکول د ډېرو ژوندیو موجوداتو د حجرو جنیټیک یا وراثتي معلومات ساتي. د دې معلوماتو ځینې برخې جینونه بلل کېږي؛ جینونه د حجرو سره د پروټینونو او نورو فعالو مالیکولونو په جوړولو کې لارښوونه کوي. DNA د نیوکلیوټایډونو له تکراري واحدونو جوړ دی، او هر نیوکلیوټایډ د ډي‌اکسي‌رایبوز قند، فاسفېټ ډلې او له څلورو نایتروجني بنسټونو څخه یوه لري: اډېنین (A)، تایمین (T)، ګوانین (G) او سایټوسین (C). په معمول DNA کې A له T او G له C سره جوړه جوړوي. د DNA دوه ځنځیرونه د دوه‌ګوني مارپیچ (double helix) بڼه لري. په انسانانو کې د DNA ډېره برخه د حجرو په نیوکلیوس کې د کروموزومونو په بڼه وي؛ لږه اندازه یې په مایتوکونډریاوو کې هم شته. انسان د DNA یوه برخه له مور او بله برخه له پلار څخه په میراث اخلي، خو د هر انسان DNA د ډېرو کوچنیو توپیرونو له امله ځانګړی ترکیب لري. DNA ازموینې د کورنۍ اړیکو، ځینو ارثي حالتونو او عدلي څېړنو په برخه کې کارېدای شي، خو د ازموینې پایلې باید د مناسب متخصص او د ازموینې د محدودیتونو په پام کې نیولو سره تفسیر شي. یادونه: DNA پخپله ژوندی موجود نه دی؛ دا د حجرو دننه د معلوماتو د ساتلو مالیکول دی.',
  source: 'NHGRI: https://www.genome.gov/about-genomics/fact-sheets/Deoxyribonucleic-Acid-Fact-Sheet'
};
const dnaEntry = OFFLINE_KNOWLEDGE.find(item =>
  normalizePashto(item.title) === normalizePashto(DNA_CORRECTION.title) ||
  (Array.isArray(item.keywords) && item.keywords.some(k => /deoxyribonucleic acid|DNA/i.test(String(k))))
);
if (dnaEntry) Object.assign(dnaEntry, DNA_CORRECTION);
else OFFLINE_KNOWLEDGE.push(DNA_CORRECTION);
const PROPHET_ARMOR_CORRECTION = {
  title: 'د رسول الله ﷺ زغره او د جوړوونکي د نوم مسئله',
  keywords: [
    'د رسول الله زغره چا جوړه کړې وه',
    'د نبي کریم زغره چا جوړه کړه',
    'کله چې نبي کریم جهاد ته تلو زغره یې چا جوړه کړې وه',
    'د پیغمبر زغره جوړوونکی څوک و',
    'د نبوي زغرې جوړوونکی',
    'د زغره جوړوونکي نوم',
    'د محمد رسول الله زغره چا جوړه کړې',
    'رسول الله armor made by',
    'Prophet Muhammad armor who made it',
    'armor of the Prophet',
    'Sahih Bukhari 2916 armor',
    'من صنع درع النبي',
    'درع النبي من صنعه'
  ],
  answer: 'د هغو معتبرو حدیثونو له مخې چې د رسول الله ﷺ زغره یادوي، د زغرې د جوړوونکي مشخص نوم نه دی بیان شوی؛ نو د یوه ځانګړي کس نوم په یقین سره نه شو ټاکلای. په صحیح البخاري ۲۹۱۶ کې له حضرت عایشې رضي الله عنها څخه روایت دی چې رسول الله ﷺ وفات شو، په داسې حال کې چې اوسپنیزه زغره یې د یوه یهودي سره د ۳۰ صاع وربشو په بدل کې ګرو وه. په صحیح البخاري ۲۵۰۹ او ۲۵۱۳ کې هم راغلي چې رسول الله ﷺ خوراک په پور واخیست او خپله زغره یې د پور د ضمانت په توګه کېښوده. دا روایتونه د زغرې د ګرو کېښودلو خبره کوي، خو دا نه وايي چې زغره کوم آهنګر یا کوم کس جوړه کړې وه. له همدې امله د جوړوونکي نوم ته اړتیا ده چې له جلا او باوري تاریخي سرچینې سره ثابت شي؛ یوازې د ګرو اخیستونکي نوم د زغرې د جوړوونکي دلیل نه دی.',
  source: 'صحیح البخاري ۲۹۱۶: https://sunnah.com/bukhari:2916\nصحیح البخاري ۲۵۰۹: https://sunnah.com/bukhari:2509\nصحیح البخاري ۲۵۱۳: https://sunnah.com/bukhari:2513'
};
const prophetArmorEntry = OFFLINE_KNOWLEDGE.find(item =>
  normalizePashto(item.title) === normalizePashto(PROPHET_ARMOR_CORRECTION.title) ||
  (Array.isArray(item.keywords) && item.keywords.some(k =>
    /د رسول الله زغره چا جوړه کړې|Sahih Bukhari 2916 armor/i.test(String(k))
  ))
);
if (prophetArmorEntry) Object.assign(prophetArmorEntry, PROPHET_ARMOR_CORRECTION);
else OFFLINE_KNOWLEDGE.push(PROPHET_ARMOR_CORRECTION);
const CRYPTO_CURRENCY_CORRECTION = {
  title: 'کریپټو کرنسي (Cryptocurrency)',
  keywords: [
    'کریپټو کرنسي څه ده',
    'کریپټو کرنسۍ څه ده',
    'کريپټو کرنسي',
    'کريپټو کرنسۍ',
    'کریپټو کرنسي',
    'رمزي پیسه',
    'ډیجیټلي شتمني کریپټو',
    'cryptocurrency',
    'cryptocurrencies',
    'crypto currency',
    'digital currency blockchain',
    'بټکوین Bitcoin',
    'ایتیریوم Ethereum'
  ],
  answer: 'کریپټو کرنسي یا رمزي پیسه د ډیجیټلي شتمنۍ یوه بڼه ده چې د معاملاتو او مالکیت د ثبت لپاره عموماً بلاک‌چېن یا ورته وېشل شوی ډیجیټلي دفتر کاروي. د «کریپټو» اصطلاح د رمزپوهنې هغو لارو ته اشاره کوي چې د معاملاتو د تصدیق او د شتمنۍ د کنټرول لپاره کارېږي. د دودیزو پیسو په څېر په کاغذي نوټونو نه وي، او ډېر ډولونه یې د یوه مرکزي بانک له خوا نه صادرېږي یا نه تضمینېږي.\n\nبلاک‌چېن د معاملاتو د ثبت ګډ دفتر ته ورته دی چې کاپي یې د شبکې په ګڼو کمپیوټرونو کې ساتل کېدای شي. د شبکې اصول ټاکي چې کومې معاملې تایید او ثبت شي. په ځینو شبکو کې د کان‌کېندنې (mining) یا د سټېک کولو (staking) په څېر میکانېزمونه کارېږي، خو د ټولو کریپټو پروژو طریقه یوه شان نه ده.\n\nبټکوین (Bitcoin) د کریپټو کرنسۍ یوه مشهوره بېلګه ده. ایتیریوم (Ethereum) یوه شبکه ده چې خپل ټوکن، اېتِر (Ether)، لري او د سمارټ قراردادونو او نورو ډیجیټلي پروګرامونو لپاره هم کارول کېږي. هر ټوکن حتماً د ورځني پېر او پلور پیسې نه وي؛ ځینې د شبکې د کارونې، د یوې پروژې د حقونو یا د بلې شتمنۍ د ارزښت د تعقیب لپاره وي. سټېبل‌کوینونه د یوه ارزښت، لکه د ډالر، سره د تړاو ساتلو هڅه کوي، خو نوم یې د بشپړ ثبات یا بې‌خطرۍ ضمانت نه دی.\n\nکریپټو شتمني د ډیجیټلي بټوې له لارې اداره کېږي. بټوه عموماً خصوصي کیلي یا د بېرته لاسرسي پټه جمله ساتي؛ همدا معلومات د شتمنۍ د لېږلو اجازه برابروي. که خصوصي کیلي یا پټه جمله ورکه یا غلا شي، د پیسو بېرته ترلاسه کول ډېر ستونزمن یا ناممکن کېدای شي. معاملې ناسمې پتې ته لېږل هم اکثره بېرته نه راګرځي.\n\nمهم خطرونه یې د بیو سخت بدلون، درغلۍ، جعلي پانګونې، د کیلي یا حساب غلا، تخنیکي ستونزې او د هېوادونو د قوانینو توپیرونه دي. د یوې شتمنۍ شهرت یا د ټولنیزو رسنیو اعلان د هغې د ارزښت او خوندیتوب ثبوت نه دی. له همدې امله کریپټو باید د خطر لرونکې ډیجیټلي شتمنۍ په توګه وپېژندل شي؛ ارزښت یې تضمین نه دی.',
  source: 'پښتو ویکیپیډیا (د کارونکي له خوا ورکړل شوې پاڼه): https://ps.wikipedia.org/wiki/%D8%AF_%DA%A9%D8%B1%D9%8A%D9%BE%D9%BC%D9%88_%DA%A9%D8%B1%D9%86%D8%B3%DB%8D\nEnglish Wikipedia — Cryptocurrency: https://en.wikipedia.org/wiki/Cryptocurrency'
};
const cryptoCurrencyEntry = OFFLINE_KNOWLEDGE.find(item =>
  normalizePashto(item.title) === normalizePashto(CRYPTO_CURRENCY_CORRECTION.title) ||
  (Array.isArray(item.keywords) && item.keywords.some(k =>
    /کریپټو کرنسي څه ده|cryptocurrency/i.test(String(k))
  ))
);
if (cryptoCurrencyEntry) Object.assign(cryptoCurrencyEntry, CRYPTO_CURRENCY_CORRECTION);
else OFFLINE_KNOWLEDGE.push(CRYPTO_CURRENCY_CORRECTION);

const SEEN_GROUP_NAMES = new Map();


function rememberGroupMember(groupJid, participantJid, participantName) {
  if (!groupJid || !participantJid || !participantName) return;
  const key = String(groupJid);
  if (!SEEN_GROUP_NAMES.has(key)) SEEN_GROUP_NAMES.set(key, new Map());
  SEEN_GROUP_NAMES.get(key).set(String(participantJid), String(participantName).slice(0, 80));
}

function answerIdentityQuestion(groupJid, participantJid, participantName, question) {
  const q = normalizePashto(question);
  if (!q) return null;

  if (/(زه څوک یم|زما نوم څه دی|زما نوم څوک دی|ته ما پېژنې|ته ما پیژنې|زما په اړه څه پوهېږې)/u.test(q)) {
    const safeName = String(participantName || '').trim().slice(0, 80) || 'د WhatsApp غړی';
    return '👤 ستا د WhatsApp ښکاره نوم «' + safeName + '» دی.\n\n' +
      '📌 زه نوم د پیغام له WhatsApp معلوماتو پېژنم؛ دا د شخص د قانوني هویت یا ژوند د نورو معلوماتو تصدیق نه دی.';
  }

  const groupMap = SEEN_GROUP_NAMES.get(String(groupJid));
  if (!groupMap) return null;
  const candidates = [...groupMap.entries()]
    .filter(([jid]) => jid !== String(participantJid))
    .map(([jid, name]) => ({ jid, name, normalized: normalizePashto(name) }))
    .filter(x => x.normalized.length >= 2);
  const mentionsWho = /(څوک دی|څوک ده|څوک و|څوک وه|څوک دي|څوک دي؟|څوک ده؟|څوک دی؟|پېژنې|پیژنې|نوم یې څوک دی)/u.test(q);
  if (!mentionsWho) return null;

  const matched = candidates
    .filter(x => x.normalized && q.includes(x.normalized))
    .sort((a, b) => b.normalized.length - a.normalized.length)[0];

  if (matched) {
    return '👤 «' + matched.name + '» د WhatsApp په پیغامونو کې د ګروپ د یوه غړي د ښکاره نوم په توګه ثبت شوی دی.\n\n' +
      'ℹ️ یوازې د WhatsApp نوم د شخص د قانوني هویت، دندې یا شخصي ژوند د تایید لپاره بسنه نه کوي.';
  }
  return null;
}

function answerFromOfflineKnowledge(question) {
  const q = normalizePashto(question);
  // د کریپټو د تعریف پوښتنې د کلمو له عمومي نمرو مخکې په مستقیم ډول پېژنو،
  // څو د لیکدود توپیر یا اوږده غوښتنه د باوري محلي ځواب مخه ونه نیسي.
  if (isCryptoEducationQuestion(question)) {
    return '📚 *' + CRYPTO_CURRENCY_CORRECTION.title + '*\n\n' +
      CRYPTO_CURRENCY_CORRECTION.answer +
      (CRYPTO_CURRENCY_CORRECTION.source
        ? '\n\n📖 سرچینې: ' + CRYPTO_CURRENCY_CORRECTION.source
        : '');
  }
  if (q.length < 2 || !OFFLINE_KNOWLEDGE.length) return null;

  // د زغرې ځانګړې تاریخي داخله یوازې د زغرې اړوند پوښتنو ته وکاروه؛
  // د رسول الله ﷺ په اړه عمومي پوښتنې باید په تېروتنه دې ځواب ته ونه رسېږي.
  const knowledgeItems = OFFLINE_KNOWLEDGE.filter(item =>
    normalizePashto(item.title) !== normalizePashto(PROPHET_ARMOR_CORRECTION.title) ||
    /(?:زغره|زغرې|درع|armor|armour)/iu.test(q)
  );

  // عامې پوښتنیزې او تړونکې کلمې د موضوع د پېژندلو پر ځای له نمرو وباسه.
  const stopWords = new Set([
    'د', 'په', 'له', 'او', 'یا', 'چې', 'دا', 'هغه', 'دی', 'ده', 'دي', 'دې',
    'څه', 'شی', 'څوک', 'څنګه', 'ولې', 'کوم', 'کومه', 'کومې', 'کومو', 'کوي',
    'و', 'وه', 'یې', 'هم', 'راکړه', 'لري', 'شي', 'شوی', 'شوې', 'کې',
    'ته', 'زما', 'ستا', 'ئې', 'دوی', 'دغه', 'داسې', 'یوه', 'یو', 'دئ',
    'تعریف', 'معلومات', 'په اړه', 'کوم دي', 'څو دي'
  ]);

  const stem = (token) => String(token || '')
    .replace(/(ونو|ګانو|و|ونه|انو|ونه|ان)$/u, '')
    .replace(/(ی|ه|ي)$/u, '');

  const tokens = (value) => normalizePashto(value)
    .split(' ')
    .map(stem)
    .filter(token => token.length >= 2 && !stopWords.has(token));

  const questionTokens = [...new Set(tokens(q))];
  if (!questionTokens.length) return null;

  // د هرې موضوع د سرلیک او کلیدي کلمو له مخې د کم‌عمومي کلمو وزن لوړ کړه.
  // دا د «مالیه څه ده؟» پوښتنې د «مخابراتو» یا بل نامربوط مضمون له ځواب سره د ګډېدو خطر کموي.
  const itemTokenSets = knowledgeItems.map(item =>
    new Set(tokens([
      item.title,
      ...(Array.isArray(item.keywords) ? item.keywords : [])
    ].filter(Boolean).join(' ')))
  );
  const documentFrequency = new Map();

  for (const tokenSet of itemTokenSets) {
    for (const token of tokenSet) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }

  const tokenWeight = (token) =>
    1 + Math.log((knowledgeItems.length + 1) /
      ((documentFrequency.get(token) || 0) + 1));

  let best = null;
  let bestScore = 0;
  let bestTitleOverlap = -1;

  for (let index = 0; index < knowledgeItems.length; index += 1) {
    const item = knowledgeItems[index];
    const terms = [item.title, ...(Array.isArray(item.keywords) ? item.keywords : [])]
      .filter(Boolean)
      .map(normalizePashto);

    let phraseScore = 0;
    for (const term of terms) {
      if (q === term) {
        phraseScore = Math.max(phraseScore, 100 + Math.min(term.length / 20, 5));
      } else if (term.includes(' ') && term.length >= 6 && q.includes(term)) {
        // بشپړ څو-کلمیز عبارت ته د عمومي کلمو له ورته والي لوړ لومړیتوب ورکړه.
        phraseScore = Math.max(phraseScore, 55 + Math.min(term.length / 20, 5));
      }
    }

    const itemTokens = itemTokenSets[index];
    const matches = questionTokens.filter(token => itemTokens.has(token));
    let tokenScore = 0;
    let titleOverlap = 0;

    if (matches.length) {
      const weightedOverlap = matches.reduce((sum, token) => sum + tokenWeight(token), 0);
      const coverage = matches.length / questionTokens.length;
      const titleTokens = new Set(tokens(item.title || ''));
      titleOverlap = matches.filter(token => titleTokens.has(token)).length;

      tokenScore = weightedOverlap * (0.4 + 0.6 * coverage);
      tokenScore += titleOverlap * 1.5;

      if (matches.length >= 2) {
        tokenScore += 4 + Math.min(matches.length, 3);
      }

      // که پوښتنه څو ځانګړي مفاهیم لري، یوازې د یوې عمومي کلمې له مخې ځواب مه ټاکه.
      if (questionTokens.length >= 3 && matches.length === 1 && coverage < 0.34) {
        tokenScore *= 0.35;
      } else if (questionTokens.length >= 2 && matches.length === 1 && coverage < 0.5) {
        tokenScore *= 0.65;
      }
    }

    const score = Math.max(phraseScore, tokenScore);
    if (score > bestScore || (score === bestScore && titleOverlap > bestTitleOverlap)) {
      bestScore = score;
      bestTitleOverlap = titleOverlap;
      best = item;
    }
  }

  if (!best || bestScore < 5) return null;

  return '📚 *' + best.title + '*\n\n' + best.answer +
    (best.source ? '\n\n📖 سرچینې: ' + best.source : '') +
    (isTimeSensitiveQuestion(question)
      ? '\n\nℹ️ دا ځواب د بوټ له ثبت شوو معلوماتو څخه دی؛ د تازه بدلېدونکو خبرونو، بیو او شمېرو لپاره رسمي سرچینه وګورئ.'
      : '');
}
function answerSimpleMathQuestion(question) {
  const digitMap = {
    '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9',
    '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'
  };
  const raw = String(question || '').replace(/[۰-۹٠-٩]/g, digit => digitMap[digit]);
  const match = raw.match(/(\d+(?:[.,]\d+)?)\s*(\+|جمع|plus|add|-|−|منها|تفریق|minus|×|\*|ضرب|times|÷|\/|تقسیم|divide)\s*(\d+(?:[.,]\d+)?)/iu);
  if (!match) return null;

  const left = Number(match[1].replace(',', '.'));
  const right = Number(match[3].replace(',', '.'));
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;

  const operator = match[2].toLowerCase();
  let result;
  if (['+', 'جمع', 'plus', 'add'].includes(operator)) result = left + right;
  else if (['-', '−', 'منها', 'تفریق', 'minus'].includes(operator)) result = left - right;
  else if (['×', '*', 'ضرب', 'times'].includes(operator)) result = left * right;
  else {
    if (right === 0) return '🧮 صفر باندې وېشل نه شي کېدای.';
    result = left / right;
  }

  if (!Number.isFinite(result)) return null;
  const formatted = String(Number(result.toFixed(8))).replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
  return '🧮 د حساب ځواب: ' + formatted;
}

function answerCommonPashtoQuestion(question) {
  const value = normalizePashto(String(question || ''));
  if (/اسلام.*(?:بناو|رکن)|(?:بناو|رکن).*اسلام/u.test(value)) {
    return '📚 اسلام پنځه بناوې لري:\n۱) کلمهٔ شهادت\n۲) لمونځ\n۳) زکات\n۴) د رمضان روژه\n۵) د وس لرونکي مسلمان حج.\n\n📖 سرچینه: صحیح مسلم، د جبرائیل علیه السلام حدیث، حدیث ۸a.\nhttps://sunnah.com/muslim:8a';
  }
  return null;
}

// د ژوند، محرمیت او سیاسي خوندیتوب لپاره د شخصي معلوماتو/تعقیب خطرناکې غوښتنې فلټر.
function isSensitiveSafetyRequest(question) {
  const q = normalizePashto(question);

  const asksPrivateDetails =
    /(?:شخص[يی]|خصوص[يی])\s*(?:پته|شمېره|شماره|نمبر|موبایل|تلیفون)|د\s*کور\s*پته|د\s*اوسېدو\s*ځای|د\s*استوګنې\s*پته|دقیق(?:ه)?\s*(?:ځای|موقعیت)|اوسنی\s*(?:ځای|موقعیت)|پټ\s*(?:ځای|موقعیت)|چېرته\s*اوسېږي|چیرته\s*اوسیږي|چېرته\s*ژوند\s*کوي|چیرته\s*ژوند\s*کوي|home\s*address|private\s*(?:phone|address|number)|exact\s*(?:location|address)|where\s+does\s+.{1,60}\s+live/iu.test(q);

  const asksExactPersonLocation =
    /(?:د\s+.{1,50}\s+(?:اوسنی|دقیق|پټ)\s*(?:ځای|موقعیت)|(?:اوسنی|دقیق|پټ)\s*(?:ځای|موقعیت)\s+د\s+.{1,50})/iu.test(q);

  const asksTrackingOrHarm =
    /څنګه\s+(?:تعقیب|وڅار|په\s+نښه|ووژنم|زیان\s+ورسوم)|د\s*(?:تعقیب|وژلو|برید|حملې|په\s+نښه\s+کولو)\s*(?:لپاره|طریقه|لار)|په\s+نښه\s+کولو\s+لپاره|پټ\s+تعقیب|how\s+to\s+(?:track|target|attack|kill|doxx)|(?:track|locate|follow)\s+(?:him|her|them|someone|a\s+person)|doxx/iu.test(q);

  return asksPrivateDetails || asksExactPersonLocation || asksTrackingOrHarm;}

// د سرچینو لټون او د ځواب د پرېکړې بهیر جلا ماډولونو ته انتقال شوی.
const answerWithKnowledge = createAnswerEngine({
  ENABLE_GROUP_QA,
  ENABLE_INTERNET_SEARCH,
  ENABLE_AI_SUMMARIZATION,
  looksLikeQuestion,
  isSensitiveSafetyRequest,
  safeSend,
  buildVerifiedQuranLongestWordAnswer,
  answerSimpleMathQuestion,
  answerCommonPashtoQuestion,
  answerIdentityQuestion,
  buildAnswerPlan,
  requiresFactualSourceEvidence,
  answerFromOfflineKnowledge,
  normalizePashto,
  hasTrustedReligiousReferenceText,
  requiresAuthoritativeReligiousSource,
  asksForReligiousReferences,
  requestsInternetSearch,
  isTimeSensitiveQuestion,
  searchInternet,
  isTafsirYaseerAuthorshipQuestion,
  filterTafsirYaseerAuthorSources,
  filterTrustedReligiousSources,
  summarizeSourcesInPashto,
  formatVerifiedSourceLinks,
  formatInternetResults,
  readOpenRouterApiKey,
});


// 2. د WhatsApp تنظیمات
// ======================================================

// د pairing شمېره د lib/runtime-config.js له محرم Environment یا محلي ignored فایل څخه لوستل کېږي.
const PHONE = runtimeConfig.whatsapp.phone;

// د پخوانۍ ناستې فولډر.
const AUTH_DIR = path.resolve(
  process.cwd(),
  'session_auth_1'
);

// د یو ځل لپاره د ناستې د پاکولو نښه.
// دا د دې لپاره ده چې د RESET متغیر په فعال پاتې کېدو
// سره په هر عادي Restart کې ناسته بیا بیا پاکه نه شي.
const RESET_MARKER = path.resolve(
  process.cwd(),
  '.whatsapp-session-reset-done'
);

// ======================================================
// 3. د نوي اتصال لپاره د پخوانۍ ناستې پاکول
// ======================================================

// که د WhatsApp ناسته بیا نښلول غواړې، د چاپېریال متغیر تنظیم کړه:
//
// RESET_WHATSAPP_SESSION=true
//
// بیا Deploy کړه.
//
// کوډ به پخوانۍ ناسته یوازې یو ځل پاکه کړي.
// د نښې فایل تر موجودیت پورې به دا کار تکرار نه شي.
//
// وروسته له دې چې نوی اتصال بشپړ شو،
// RESET_WHATSAPP_SESSION متغیر له Environment څخه لرې کړه
// یا یې false کړه.

function prepareAuthSessionForOneTimeReset() {
  const resetRequested = runtimeConfig.whatsapp.resetSessionRequested;

  if (!resetRequested) {
    return;
  }

  // که د پاکولو نښه موجوده وي، بیا ناسته مه پاکوه.
  if (fs.existsSync(RESET_MARKER)) {
    console.log(
      'ℹ️ د ناستې د پاکولو یو ځلنی کار مخکې ترسره شوی.'
    );

    return;
  }

  try {
    // د زړې WhatsApp ناستې پاکول.
    fs.rmSync(AUTH_DIR, {
      recursive: true,
      force: true,
    });

    // ثبتول چې د پاکولو کار ترسره شو.
    fs.writeFileSync(
      RESET_MARKER,
      new Date().toISOString(),
      'utf8'
    );

    console.log(
      '🔄 پخوانۍ WhatsApp ناسته پاکه شوه.'
    );

    console.log(
      '🔐 بوټ به د نوي اتصال کوډ جوړولو هڅه وکړي.'
    );

  } catch (err) {
    console.error(
      '❌ د پخوانۍ ناستې پاکول ناکام شول:',
      err?.message || err
    );

    throw err;
  }
}

// ======================================================
// 5. د ګروپ رسمي قوانین
// ======================================================

const GROUP_RULES = `📜 *Maloomat AI | معلومات AI — د ګروپ رسمي او مهم قوانین* 📜

🎯 *۱ ـ د ګروپ موخه:* دا ډله د علم، زده‌کړې، ټکنالوژۍ او ګټورو معلوماتو د شریکولو لپاره ده؛ خبرې مو له همدې موخې سره برابرې وساتئ.

🤝 *۲ ـ متقابل درناوی:* له ټولو غړو سره په ادب چلند وکړئ. کنځل، سپکاوی، ګواښ، ځورول، ملنډې او شخصي شخړې منع دي.

🔗 *۳ ـ لینکونه او اعلانونه:* نامجاز لینکونه او تکراري تبلیغاتي پیغامونه مه خپروئ؛ بوټ به یې حذف کړي او اخطار به ورکړي. یوازې د بوټ د اجازې لېست لینکونه او د ګروپ د تایید شوو مدیرانو لینکونه مستثنا دي.

🚫 *۴ ـ سپم او تکراري پیغامونه:* یو پیغام بیا بیا مه استوئ؛ ډېر پرله‌پسې پیغامونه، بې‌ځایه ټګونه او د ګروپ ګډوډول منع دي.

🛡️ *۵ ـ خوندي محتوا:* فریب، درغلۍ، جعلي جایزې، د پیسو غوښتلو مشکوک پیغامونه، ناوړه فایلونه او د حسابونو د غلا هڅې مه شریکوئ.

✅ *۶ ـ د معلوماتو کره‌والی:* خبرونه او ادعاوې تر شریکولو مخکې له باوري سرچینې وڅېړئ. اوازې او ناتایید شوي خبرونه د حقیقت په توګه مه خپروئ؛ سرچینه ورسره ولیکئ.

🔐 *۷ ـ محرمیت:* د چا شخصي شمېره، عکسونه، غږیز پیغامونه، شخصي خبرې یا نور معلومات د هغه له اجازې پرته مه خپروئ. د بل چا هویت مه جعلوئ.

🌿 *۸ ـ مناسبه محتوا:* فحش، جنسي، تاوتریخوالي ته هڅوونکې، کرکجنه، توهینوونکې یا د غیرقانوني کارونو لارښوونې لرونکې محتوا منع ده.

🎙️ *۹ ـ غږیز، Status او رسنیز پیغامونه:* بې‌اړتیا غږیز پیغامونه، اوږده ویډیوګانې، نامناسب فایلونه، د WhatsApp Status شریک شوي پوسټونه او د WhatsApp چینلونو فارورډ شوي پوسټونه مه خپروئ؛ د اړوند موضوع لنډیز او سرچینه په لیکلې بڼه شریک کړئ.

📚 *۱۰ ـ موضوعي ګډون:* پوښتنې په روښانه ډول ولیکئ، اړوند ځواب ورکړئ او د نورو د زده‌کړې لپاره ګټور معلومات شریک کړئ. له موضوع سره بې‌اړخې خبرې کمې کړئ.

👮 *۱۱ ـ د ادارې لارښوونې:* د ګروپ د مدیرانو او بوټ د نظم ساتنې لارښوونې مراعات کړئ. د سرغړونې پیغام حذف کېدای شي؛ د تکراري یا جدي سرغړونو په صورت کې مدیران د اخطار یا له ګروپ څخه د ایستلو پرېکړه کولی شي.

⚠️ *۱۲ ـ د بوټ محدودیتونه:* بوټ د نظم ساتلو لپاره مرسته کوي، خو هره سرغړونه یا پټ لینک نه شي پېژندلای. که ستونزه ووینئ، د ګروپ مدیر خبر کړئ.

💚 *۱۳ ـ ګډ مسؤلیت:* د ګروپ ښه فضا د ټولو په همکارۍ جوړېږي. د نورو وخت، نظر او ارامتیا ته ارزښت ورکړئ.

🌟 *زموږ شعار:* معلومات زده کړه، پوهه خپره کړه!

🤝 د قوانینو د مراعاتولو او د Maloomat AI | معلومات AI د لا ښه کولو لپاره مننه!`;



// ======================================================
// 11. د پیغام لېږلو خوندي طریقه
// ======================================================

async function safeSend(
  socket,
  jid,
  content
) {
  try {
    if (!socket || !jid || !content) {
      return null;
    }

    // اوږده عادي متني ځوابونه په جلا WhatsApp پیغامونو وېشه؛ نورې رسنۍ مه تکراروه.
    const canSplitText = typeof content.text === 'string' &&
      Object.keys(content).length === 1;
    const messageParts = canSplitText ? splitWhatsAppText(content.text) : [null];

    if (canSplitText && messageParts.length > 1) {
      let lastResult = null;
      for (let index = 0; index < messageParts.length; index += 1) {
        lastResult = await socket.sendMessage(jid, { text: messageParts[index] });
        if (index < messageParts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
      }
      return lastResult;
    }

    return await socket.sendMessage(jid, content);
  } catch (err) {
    console.error(
      '❌ د WhatsApp پیغام لېږلو ستونزه:',
      err?.message || err
    );

    return null;
  }
}

// ======================================================
// 12. د منع شوي پیغام د حذف هڅه
// ======================================================

async function deleteGroupMessage(
  socket,
  jid,
  messageKey,
  participantName,
  reason,
  sendWarning = true,
  warningParticipantIdentifier = null
) {
  let deleted = false;

  try {
    const result = await socket.sendMessage(jid, {
      delete: messageKey,
    });

    if (result) {
      deleted = true;
    }

    console.log(
      `🗑️ د حذف غوښتنه واستول شوه: ${reason}`
    );

  } catch (err) {
    console.error(
      '❌ د پیغام حذف ناکام شو. ' +
      'وګوره چې بوټ د ګروپ مدیر دی که نه:',
      err?.message || err
    );
  }

  if (sendWarning) {
    // د PN/LID بدیلونو پر ځای د metadata له مخې ثابت کلید استعمال کړه؛
    // که WhatsApp د یوه غړي JID په بل ترتیب راولېږي، اخطار بیا له صفره نه شمېرل کېږي.
    const offenderJid =
      warningParticipantIdentifier ||
      messageKey?.participant ||
      messageKey?.participantAlt ||
      participantName ||
      'unknown';

    // شریک throttle: که دې غړي ته په وروستيو ۳۰ ثانیو کې اخطار استول شوی وي،
    // نوی اخطار نه استوي — دې سره د بوټ اخطارونه پخپله سپم نه کیږي.
    if (!shouldSendWarningNow(jid, offenderJid)) {
      return;
    }

    const warningCount = recordViolationWarning(jid, offenderJid);
    if (warningCount >= 3 && WARNING_MUTE_ENABLED) {
      setTemporaryMute(jid, offenderJid, WARNING_MUTE_DURATION_MS);
    }
    const statusText = deleted
      ? 'د پیغام د حذف غوښتنه واستول شوه.'
      : 'د پیغام حذف تایید نه شو؛ د بوټ د مدیر اجازه او د اتصال حالت وګوره.';

    const escalationText = warningCount >= 3
      ? (WARNING_MUTE_ENABLED
        ? '\n\n⛔ دا درېیم یا ورپسې اخطار دی. د ' +
          WARNING_MUTE_DURATION_MINUTES +
          ' دقیقو لنډمهاله محدودیت فعال شو؛ په دې موده کې د دې غړي راتلونکي پیغامونه به بوټ حذف کړي.'
        : '\n\n⛔ دا په تېرو ۲۴ ساعتونو کې درېیم یا ورپسې اخطار دی. د ګروپ مدیر دې موضوع وڅېړي.')
      : '\n\n📌 اخطار: ' + warningCount + ' له ۳ څخه. مهرباني وکړئ قوانین مراعات کړئ.';

    await safeSend(socket, jid, {
      text:
        `⚠️ محترم ${participantName} جانه!\n\n` +
        `${reason}\n` +
        `${statusText}` +
        escalationText +
        '\n🤝 د بیا تکرار په صورت کې به د ګروپ مدیر ته د اقدام سپارښتنه وشي.',
    });
  }
}

// د ګروپ مېټاډاټا لنډمهاله cache: په هر پیغام کې د WhatsApp API مه رابوله.
// د اډمین رول په عادي حالت کې ۶۰ ثانیې cache کېږي؛ ناکامي ۱۰ ثانیې cache کېږي
// څو د metadata ستونزې پر مهال پر هر پیغام نوې غوښتنه ونه شي.
const GROUP_METADATA_CACHE_TTL_MS = 60 * 1000;
const GROUP_METADATA_FAILURE_CACHE_TTL_MS = 10 * 1000;
const GROUP_METADATA_CACHE = new Map();
const GROUP_METADATA_INFLIGHT = new Map();

async function getGroupMetadataCached(socket, groupJid) {
  const key = String(groupJid || '');
  const now = Date.now();
  const cached = GROUP_METADATA_CACHE.get(key);
  if (cached && cached.expiresAt > now) return cached.metadata;

  if (GROUP_METADATA_INFLIGHT.has(key)) {
    return GROUP_METADATA_INFLIGHT.get(key);
  }

  const request = (async () => {
    try {
      const metadata = await socket.groupMetadata(key);
      const usableMetadata = metadata && Array.isArray(metadata.participants)
        ? metadata
        : null;
      GROUP_METADATA_CACHE.set(key, {
        metadata: usableMetadata,
        expiresAt: Date.now() + (
          usableMetadata ? GROUP_METADATA_CACHE_TTL_MS : GROUP_METADATA_FAILURE_CACHE_TTL_MS
        ),
      });
      while (GROUP_METADATA_CACHE.size > 500) {
        const oldestKey = GROUP_METADATA_CACHE.keys().next().value;
        if (!oldestKey) break;
        GROUP_METADATA_CACHE.delete(oldestKey);
      }
      return usableMetadata;
    } catch (err) {
      GROUP_METADATA_CACHE.set(key, {
        metadata: null,
        expiresAt: Date.now() + GROUP_METADATA_FAILURE_CACHE_TTL_MS,
      });
      throw err;
    } finally {
      GROUP_METADATA_INFLIGHT.delete(key);
    }
  })();

  GROUP_METADATA_INFLIGHT.set(key, request);
  return request;
}

// د هر پیغام لپاره اډمین رول او ثابت پېژندپاڼه له یوه metadata غوښتنې څخه ترلاسه کړه.
// یوازې د WhatsApp تایید شوی admin role د سپم له معافیت سره تړلی دی؛ ښکاره نوم نه کارول کېږي.
async function resolveGroupSender(socket, groupJid, senderIdentifiers) {
  let participants = [];
  try {
    const metadata = await getGroupMetadataCached(socket, groupJid);
    participants = Array.isArray(metadata?.participants) ? metadata.participants : [];
  } catch (err) {    console.warn('⚠️ د ګروپ د اډمین رول کتنه ناکامه شوه:', err?.message || err);
  }

  const participant = findGroupParticipant(participants, senderIdentifiers);
  return {
    isAdmin: isGroupAdminParticipant(participant),
    participantKey: getCanonicalParticipantIdentifier(participants, senderIdentifiers),
    phoneNumber: participant?.phoneNumber || null,
  };
}

// د لینک اجازه: لومړی د شمېرې/اجازه لرونکي ډومېن لېست وګوره، بیا د ګروپ رول.
// د اډمینانو د لینکونو او سپم معافیت لپاره هماغه cache شوی metadata شریکېږي.
async function isLinkPermittedForSender(socket, groupJid, text, senderIdentifiers) {
  const senders = [...new Set(
    (Array.isArray(senderIdentifiers) ? senderIdentifiers : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )];

  if (senders.some((sender) => isLinkPermitted(text, sender))) {
    return true;
  }

  try {
    const metadata = await getGroupMetadataCached(socket, groupJid);
    return isGroupAdminSender(metadata?.participants, senders);
  } catch (err) {
    console.error('⚠️ د لینک د اډمین اجازې کتنه ناکامه شوه:', err?.message || err);
    return false;
  }
}

// ======================================================
// 13. د اتصال او بیا وصل کېدو مدیریت
// ======================================================

let isStarting = false;
let reconnectTimer = null;
let currentSocket = null;
let pairingTimer = null;

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  console.log(
    '🔄 بوټ به پنځه ثانیې وروسته بیا وصل شي.'
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;

    startBot().catch((err) => {
      console.error(
        '❌ بیا وصل کېدل ناکام شول:',
        err?.message || err
      );

      scheduleReconnect();
    });
  }, 5000);
}

// ======================================================
// 14. د WhatsApp بوټ پیل
// ======================================================

async function startBot() {
  if (isStarting) {
    return;
  }

  isStarting = true;

  try {
    const {
      state,
      saveCreds,
    } = await getWhatsAppAuthState();

    let version;

    try {
      const latest =
        await fetchLatestBaileysVersion();

      version = latest.version;

      console.log(
        '✅ د WhatsApp نسخه:',
        version.join('.')
      );

    } catch (err) {
      console.log(
        '⚠️ د WhatsApp نسخه نه شوه ترلاسه کېدای؛ ' +
        'اصلي تنظیمات به وکارول شي.'
      );
    }

    const socketConfig = {
      auth: state,

      logger: P({
        level: 'silent',
      }),

      browser: [
        'Ubuntu',
        'Chrome',
        '20.0.0',
      ],

      markOnlineOnConnect: true,
      printQRInTerminal: false,

      // د WhatsApp اتصال ژوندی ساتلو لپاره واضح timeout/keepalive ارزښتونه.
      // Linked device باید د اصلي موبایل له بندېدو سره سم له منځه ولاړ نه شي.
      keepAliveIntervalMs: 20_000,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,

      // د حافظې د سپما لپاره د WhatsApp د بشپړ پخواني تاریخ همغږي بنده ده.
      // د نامجازو لینکونو اتومات مدیریت فعال دی؛ Status/چینل فارورډونه هم جلا کتنه کېږي.
      syncFullHistory: false,
    };

    if (version) {
      socketConfig.version = version;
    }

    const socket = makeWASocket(socketConfig);

    currentSocket = socket;

    socket.ev.on('creds.update', () => {
      saveCreds().catch((err) => {
        console.error(
          '❌ د ناستې د معلوماتو خوندي کولو ستونزه:',
          err?.message || err
        );
      });
    });

    // ==================================================
    // 15. د نوي اتصال کوډ جوړول
    // ==================================================

    if (!state.creds.registered) {
      if (pairingTimer) {
        clearTimeout(pairingTimer);
      }

      pairingTimer = setTimeout(async () => {
        pairingTimer = null;

        try {
          if (
            currentSocket !== socket ||
            state.creds.registered
          ) {
            return;
          }

          if (!PHONE) {
            console.error(
              '❌ د نوي اتصال لپاره WHATSAPP_PHONE تنظیم کړه یا ' +
              'په سرور کې whatsapp-phone.txt فایل جوړ کړه.'
            );

            return;
          }

          console.log(
            '🔐 د WhatsApp د نوي اتصال کوډ غوښتنه روانه ده...'
          );

          const code =
            await socket.requestPairingCode(PHONE);

          console.log(
            '✅ د نوي اتصال کوډ جوړ شو.'
          );

          // امنیتي یادونه:
          // دا کوډ محرم دی؛ له هیچا سره یې مه شریکوه.
          console.log(`PAIRING CODE: ${code}`);

          console.log(
            '📱 په خپل موبایل کې WhatsApp > Linked Devices > Link a device > Link with phone number وکاروه.'
          );

        } catch (err) {
          console.error(
            '❌ د اتصال کوډ جوړول ناکام شول:',
            err?.message || err
          );

          console.error(
            'ℹ️ د شمېره بڼه، د شبکې اتصال او د WhatsApp حالت وګوره.'
          );
        }
      }, 5000);
    }

    // ==================================================
    // 16. د اتصال حالت
    // ==================================================

    socket.ev.on(
      'connection.update',
      (update) => {
        const {
          connection,
          lastDisconnect,
        } = update;

        if (connection === 'connecting') {
          whatsappConnectionState = 'connecting';
        }

        if (connection === 'open') {
          whatsappConnectionState = 'connected';
          console.log(
            '✅ د Maloomat AI | معلومات AI WhatsApp بوټ فعال شو!'
          );

          console.log(
            '🛡️ د ګروپ مدیریت فعال دی: کنځل، دیني پارونه، د Status/چینل فارورډونه، چټک او تکراري سپم؛ لینک اخطارونه: ' + (ENABLE_LINK_MODERATION ? 'فعال' : 'بند') + '; ' +
            'د پوښتنو ځوابونه: ' + (ENABLE_GROUP_QA ? 'فعال' : 'موقتي بند') +
            '؛ ویب لټون: ' + (ENABLE_GROUP_QA && ENABLE_INTERNET_SEARCH ? 'فعال' : 'بند') +
            '؛ شخصي چټ: ' + (ENABLE_PRIVATE_QA && ENABLE_GROUP_QA && (PRIVATE_QA_ALLOWED_NUMBERS.size > 0 || PRIVATE_QA_ALLOWED_LIDS.size > 0) ? 'فعال' : 'بند/اجازه‌لیست تنظیم کړئ') +
            '؛ د محلي معلوماتو شمېر: ' + OFFLINE_KNOWLEDGE.length
          );

          if (pairingTimer) {
            clearTimeout(pairingTimer);
            pairingTimer = null;
          }
        }

        if (connection === 'close') {
          whatsappConnectionState = 'disconnected';

          if (pairingTimer) {
            clearTimeout(pairingTimer);
            pairingTimer = null;
          }

          if (currentSocket === socket) {
            currentSocket = null;
          }

          const statusCode =
            lastDisconnect?.error?.output?.statusCode;
          whatsappLastDisconnectCode = statusCode || null;
          whatsappLastDisconnectAt = new Date().toISOString();
          const disconnectReason = String(lastDisconnect?.error?.message || '').slice(0, 180);

          console.error(
            '⚠️ د WhatsApp اتصال بند شو؛ حالت:',
            statusCode || 'نامعلوم',
            '; دلیل:', disconnectReason || 'نه دی ورکړل شوی'
          );

          if (
            statusCode === DisconnectReason.loggedOut
          ) {
            whatsappConnectionState = 'logged_out';
            console.error(
              '❌ حساب له WhatsApp څخه وتلی؛ ' +
              'د نوي اتصال اړتیا شته.'
            );

            return;
          }

          scheduleReconnect();
        }
      }
    );

    // ==================================================
    // 17. نویو غړو ته ښه راغلاست
    // ==================================================

    socket.ev.on(
      'group-participants.update',
      async (event) => {
        try {
          // د اډمین د لوړولو/ټیټولو یا د غړو د بدلون وروسته زوړ رول مه کاروه.
          if (event?.id) GROUP_METADATA_CACHE.delete(String(event.id));

          if (
            event.action !== 'add' ||
            !Array.isArray(event.participants) ||
            !isGroupAllowed(event.id)
          ) {
            return;
          }

          for (
            const participant of event.participants
          ) {
            const number =
              String(participant).split('@')[0];

            await safeSend(
              socket,
              event.id,
              {
                text:
                  `🎉 سلام @${number} جانه! خوښ یو چې زموږ له معلوماتي کورنۍ سره یوځای شوې. ❤️\n` +
                  '📚 *دلته به څه ترلاسه کوې؟*\n' +
                  '🔬 علمي معلومات او په زړه پورې حقیقتونه\n' +
                  '🤖 د مصنوعي ځیرکتیا او نوې ټکنالوژۍ معلومات\n' +
                  '🌍 د افغانستان او نړۍ ګټور معلومات\n' +
                  '📖 د زده‌کړې، تاریخ، جغرافیې او عمومي پوهې مطالب\n' +
                  '💡 پوښتنه لرې؟ په روښانه ډول یې ولیکه؛ په درناوي له نورو غړو سره خپل معلومات او تجربې شریکې کړه.\n' +
                  '🤝 ستا ګډون زموږ د ډلې ارزښت زیاتوي. راځئ یو بل ته درناوی وکړو او په ګډه زده‌کړه وکړو.\n' +
                  '🛡️ مهرباني وکړه: کنځل، سپکاوی، پرله‌پسې سپم او نامجاز لینکونه مه خپروه؛ نامجاز لینکونه حذفېږي او اخطار لري. لایکونه/غبرګونونه اخطار نه لري.\n' +
                  '🌟 زموږ شعار: معلومات زده کړه، پوهه خپره کړه! 🌟\n' +
                  '📜 د ګروپ قوانین جلا لوستل غواړې؟ یوازې «قوانین» ولیکه؛ بوټ به یې درولېږي.',

                mentions: [participant],
              }
            );
          }

        } catch (err) {
          console.error(
            '❌ د ښه راغلاست پیغام ستونزه:',
            err?.message || err
          );
        }
      }
    );

    // ==================================================
    // 17.5 د همغږي شوي پخواني تاریخ د لینکونو پاکول
    // ==================================================

    socket.ev.on('messaging-history.set', async (event) => {
      try {
        // د پخواني تاریخ د پاکولو کېنچ: که ENABLE_HISTORY_CLEANUP=false وي،
        // د پخوانیو پیغامونو لینکونه نه حذفیږي.
        if (!isHistoryCleanupEnabled()) {
          console.log('ℹ️ د پخواني تاریخ پاکول له چاپېریال متغیره بند دی.');
          return;
        }

        const historyMessages = Array.isArray(event?.messages)
          ? event.messages
          : [];

        let checked = 0;
        let attempted = 0;
        const maxDeletesPerSync = 100;

        for (const msg of historyMessages) {
          if (!msg?.message || !msg.key || msg.key.fromMe) continue;

          const groupJid = msg.key.remoteJid || '';
          if (!groupJid.endsWith('@g.us')) continue;
          if (!isGroupAllowed(groupJid)) continue;

          const historySenderIdentifiers = [
            msg.key?.participant,
            msg.key?.participantAlt,
            msg.key?.participantPn,
          ].filter(Boolean);
          let historySenderIsExempt = isFullModerationExemptSender(historySenderIdentifiers);
          if (!historySenderIsExempt && historySenderIdentifiers.some((id) => /@lid$/i.test(String(id)))) {
            const historySenderResolution = await resolveGroupSender(socket, groupJid, historySenderIdentifiers);
            historySenderIsExempt = isFullModerationExemptSender([
              ...historySenderIdentifiers,
              historySenderResolution.phoneNumber,
            ]);
          }
          if (historySenderIsExempt) continue;

          const messageId = msg.key.id;
          if (messageId && !rememberMessage(`${groupJid}:${messageId}`)) {
            continue;
          }

          checked += 1;
          const text = extractText(msg.message);
          const channelForward = isForwardedChannelMessage(msg);
          const statusShare = isWhatsAppStatusShare(msg);
          const hasLink = ENABLE_LINK_MODERATION && LINK_PATTERN.test(text);

          const historyParticipantJid =
            msg.key?.participant || msg.key?.participantAlt || '';
          const permittedHistoryLink =
            hasLink &&
            !channelForward &&
            !statusShare &&
            await isLinkPermittedForSender(
              socket,
              groupJid,
              text,
              [historyParticipantJid, msg.key?.participantAlt]
            );

          // د لینک کنټرول چې بند وي، یوازې د URL لرونکي پخواني پیغامونه مه حذفوه.
          if (permittedHistoryLink) continue;
          if (!hasLink && !channelForward && !statusShare) continue;

          if (attempted >= maxDeletesPerSync) {
            console.log('⚠️ د پخواني Status/چینل پاکول په دې همغږي کې ۱۰۰ پیغامونو ته محدود شول؛ د WhatsApp د تاریخ او حذف محدودیتونه هم شته.');
            break;
          }

          attempted += 1;
          await deleteGroupMessage(
            socket,
            groupJid,
            msg.key,
            'غړی',
            statusShare
              ? 'پخوانی شریک شوی WhatsApp Status'
              : channelForward
                ? 'د پخواني چینل فارورډ شوی پوسټ'
                : 'پخوانی لینک',
            false
          );

          // د WhatsApp سرور ته ډېرې پرله‌پسې حذف غوښتنې نه لېږل کېږي.
          await new Promise((resolve) => setTimeout(resolve, 800));
        }

        console.log(
          `🧹 د پخواني تاریخ پاکول: ${checked} ګروپي پیغامونه وکتل شول؛ ${attempted} د پخواني Status/چینل پوسټ حذف ته وسپارل شول.`
        );
      } catch (err) {
        console.error(
          '❌ د پخواني Status/چینل د تاریخ پاکول ناکام شول:',
          err?.message || err
        );
      }
    });

    // ==================================================
    // 18. د ګروپ پیغامونه
    // ==================================================

    socket.ev.on(
      'messages.upsert',
      async (event) => {
        const messages =
          Array.isArray(event?.messages)
            ? event.messages
            : [];

        if (event?.type !== 'notify') {
          return;
        }

        for (const msg of messages) {
          try {
            if (!shouldHandleNotifyEvent(event?.type, msg)) {
              continue;
            }

            // لایکونه/غبرګونونه عادي پیغامونه نه دي؛ د سپم شمېر او اخطار څخه یې وباسه.
            if (isReactionMessage(msg.message)) {
              console.log('❤️ د WhatsApp غبرګون/لایک له نظم ساتنې او اخطارونو مستثنا شو.');
              continue;
            }

            const groupJid =
              msg.key?.remoteJid;

            const chatType = classifyRemoteJid(groupJid);
            if (chatType === 'ignore') {
              continue;
            }

            // شخصي چټ جلا اداره کېږي؛ د ګروپ د مدیریت قواعد نه پرې تطبیقېږي.
            if (chatType === 'private') {
              if (!ENABLE_PRIVATE_QA) {
                continue;
              }

              // شخصي ځوابونه یوازې مجازې شمېرې ته؛ د LID لپاره PN بدیل باید موجود وي.
              const privateSenderJids = [
                groupJid,
                msg.key?.remoteJidAlt,
                msg.key?.participant,
                msg.key?.participantAlt,
              ];
              const isPermittedPrivatePhoneJid = (jid) => {
                if (
                  typeof jid !== 'string' ||
                  !/@(?:s\.whatsapp\.net|c\.us)$/.test(jid)
                ) {
                  return false;
                }
                const digits = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
                return PRIVATE_QA_ALLOWED_NUMBERS.has(digits);
              };

              const isPermittedPrivateLid = (jid) =>
                typeof jid === 'string' &&
                /@lid$/.test(jid) &&
                PRIVATE_QA_ALLOWED_LIDS.has(jid.split('@')[0].split(':')[0]);

              let isAuthorizedPrivateSender =
                privateSenderJids.some(isPermittedPrivatePhoneJid) ||
                privateSenderJids.some(isPermittedPrivateLid);

              // که LID په ځانګړي اجازه‌لیست کې نه وي، د Baileys له محلي نقشې د PN موندلو هڅه وکړه.
              // نامعلوم LID ته په خپله اجازه نه ورکول کېږي.
              if (
                !isAuthorizedPrivateSender &&
                typeof socket.signalRepository?.lidMapping?.getPNForLID === 'function'
              ) {
                const lidJids = [
                  ...new Set(
                    privateSenderJids.filter(
                      (jid) => typeof jid === 'string' && /@lid$/.test(jid)
                    )
                  ),
                ];

                for (const lidJid of lidJids) {
                  try {
                    const mappedPhoneJid =
                      await socket.signalRepository.lidMapping.getPNForLID(lidJid);
                    if (isPermittedPrivatePhoneJid(mappedPhoneJid)) {
                      isAuthorizedPrivateSender = true;
                      break;
                    }
                  } catch (err) {
                    console.warn(
                      '⚠️ د شخصي چټ د LID پېژندنې ستونزه:',
                      err?.message || err
                    );
                  }
                }
              }

              if (!isAuthorizedPrivateSender) {
                const lidMappingAvailable =
                  typeof socket.signalRepository?.lidMapping?.getPNForLID === 'function';
                let lidMappingFound = false;
                if (groupJid.endsWith('@lid') && lidMappingAvailable) {
                  try {
                    const mapped = await socket.signalRepository.lidMapping.getPNForLID(groupJid);
                    lidMappingFound = Boolean(mapped);
                  } catch (err) {
                    console.warn('⚠️ د LID نقشې لوستل ناکام شول:', err?.message || err);
                  }
                }
                console.log(
                  '🔒 شخصي پیغام رد شو؛ د مجازې شمېرې پېژندنه ونه شوه؛ ' +
                  'JID=' + groupJid +
                  '; د نقشې وسیله=' + (lidMappingAvailable ? 'شته' : 'نه شته') +
                  '; نقشه موندل شوې=' + (lidMappingFound ? 'هو' : 'نه') + '.'
                );
                continue;
              }

              const privateMessageId = msg.key?.id;
              if (
                privateMessageId &&
                !rememberMessage(groupJid + ':' + privateMessageId)
              ) {
                continue;
              }

              const privateText = extractText(msg.message);
              if (!privateText.trim()) {
                continue;
              }

              const privateParticipantJid =
                msg.key?.participant ||
                msg.key?.participantAlt ||
                groupJid;

              const privateRawName =
                msg.pushName ||
                String(privateParticipantJid).split('@')[0] ||
                'ملګری';

              const privateName = String(privateRawName)
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .trim()
                .slice(0, 80) || 'ملګری';

              const privateLower = privateText.toLowerCase().trim();

              console.log(
                '📩 شخصي پیغام پروسس کېږي؛ د متن اوږدوالی=' + privateText.length
              );

              const privateGreetings = [
                'سلام',
                'السلام علیکم',
                'السلامعلیکم',
                'salam',
                'hello',
                'hi',
                'وعلیکم السلام',
              ];

              if (
                privateText.length <= 60 &&
                privateGreetings.some((greeting) =>
                  privateLower.startsWith(greeting)
                )
              ) {
                await safeSend(socket, groupJid, {
                  text:
                    '🌍 وعلیکم السلام ورحمة الله وبرکاته، قدرمن ' + privateName + ' جانه! 🌸\n\n' +
                    '🌐 زه د Maloomat AI | معلومات AI مرستیال یم. 💐\n' +
                    '📚 خپله پوښتنه په پښتو، دري یا انګلیسي ژبه ولیکئ؛ هڅه کوم چې کره معلومات او ګټور ځواب درکړم.\n' +
                    '✨ هیله ده زموږ معلوماتي خدمتونه درته ګټور تمام شي!',
                });
                continue;
              }

              await answerWithKnowledge(
                socket,
                groupJid,
                privateParticipantJid,
                privateText,
                privateName
              );
              continue;
            }

            // که د اجازې لرونکو ګروپونو لېست ټاکل شوی وي، یوازې هلته کار کوو.
            if (!isGroupAllowed(groupJid)) {
              continue;
            }

            const messageId = msg.key?.id;

            if (
              messageId &&
              !rememberMessage(
                `${groupJid}:${messageId}`
              )
            ) {
              continue;
            }

            const text =
              extractText(msg.message);
            const channelForward =
              isForwardedChannelMessage(msg);
            const statusShare =
              isWhatsAppStatusShare(msg);

            // بې‌متنه عکسونه، غږیز او نور پیغامونه هم د چټک سپم په شمېر کې حسابېږي؛
            // یوازې د متن د نشتوالي له امله یې د مدیریت کتنه مه پرېږده.

            const participantJid =
              msg.key?.participant ||
              msg.key?.participantAlt ||
              'unknown-member';

            const rawName =
              msg.pushName ||
              String(participantJid).split('@')[0] ||
              'ملګری';

            const name = String(rawName)
              .replace(
                /[\u200B-\u200D\uFEFF]/g,
                ''
              )
              .trim()
              .slice(0, 80) || 'ملګری';

            const lower =
              text.toLowerCase().trim();

            const cleanText = lower
              .replace(/[!.؟?،,]/g, '')
              .trim();

            // د قوانینو امر د سپم شمېر، کنځلو او لینک مدیریت تر مخه اجرا کړه؛
            // د پښتو/عربي «ی» توپیر او د جملې پای نښې د ځواب مخه نه نیسي.
            if (isGroupRulesCommand(text)) {
              console.log('📜 د ګروپ قوانینو غوښتنه پېژندل شوه؛ غړی=' + name);
              await safeSend(socket, groupJid, {
                text: `📜 محترم ${name} جانه!\n\n` + GROUP_RULES,
              });
              continue;
            }

            console.log(
              '📩 ګروپي پیغام پروسس کېږي؛ د متن اوږدوالی=' + text.length +
              '؛ متن شته=' + (text.trim() ? 'هو' : 'نه')
            );

            // د PN/LID دواړه پېژندپاڼې ورکوو؛ ثابت کلید د شمېر، اخطار او موقتي محدودیت لپاره هم کارېږي.
            const senderIdentifiers = [
              participantJid,
              msg.key?.participant,
              msg.key?.participantAlt,
              msg.key?.participantPn,
              msg.key?.remoteJidAlt,
            ].filter(Boolean);
            const senderResolution = await resolveGroupSender(
              socket,
              groupJid,
              senderIdentifiers
            );
            const isSenderGroupAdmin = senderResolution.isAdmin;
            const isFullModerationExempt = isFullModerationExemptSender([
              ...senderIdentifiers,
              senderResolution.phoneNumber,
            ]);
            if (isFullModerationExempt) {
              console.log('🔐 د مالک باوري شمېره د ګروپ له ټولو اتومات نظم/اخطارونو معاف وپېژندل شوه.');
            }
            const stableParticipantJid = senderResolution.participantKey || participantJid;

            // اډمین کولای شي د اتومات خپرولو لپاره د همدې ګروپ JID په خصوصي پیغام کې ترلاسه کړي.
            // دا د ډلې نوم یا د بل ګروپ ID نه اټکلوي؛ یوازې د پیغام حقیقي remoteJid کاروي.
            if (
              isSenderGroupAdmin &&
              /^(?:groupid|group id|group jid|د ګروپ id|د ګروپ jid|ګروپ id|ګروپ jid|ګروپ ایدی|ګروپ آیډي|ګروپ آی ډي)$/iu.test(cleanText)
            ) {
              console.log('🔐 د اډمین له خوا د ګروپ پېژندونکي غوښتنه وشوه.');
              const privateReply = await safeSend(socket, participantJid, {
                text:
                  '📌 د دې WhatsApp ګروپ JID:\n' + groupJid + '\n\n' +
                  'په SillyDev کې د AUTO_POST_GROUP_JID د ارزښت په توګه همدا دقیق ID وکاروه.\n' +
                  'یادونه: اتومات خپرول تر AUTO_POST_ENABLED=true پورې بند پاتې کېږي.',
              });
              await safeSend(socket, groupJid, {
                text: privateReply
                  ? '✅ د ګروپ پېژندونکی مې ستا خصوصي WhatsApp چټ ته ولېږه.'
                  : 'ℹ️ د ګروپ پېژندونکی د SillyDev Console په لاګ کې ثبت شو؛ مهرباني وکړئ Console وګوره.',
              });
              continue;
            }

            const activeMute = WARNING_MUTE_ENABLED && !isFullModerationExempt
              ? getTemporaryMuteStatus(groupJid, stableParticipantJid)
              : null;
            if (activeMute) {
              const minutesLeft = Math.max(1, Math.ceil(activeMute.remainingMs / 60000));
              await deleteGroupMessage(
                socket,
                groupJid,
                msg.key,
                name,
                '⛔ د درېیم اخطار له امله لنډمهاله محدودیت فعال دی. د بندیز د ختمېدو لپاره نږدې ' +
                  minutesLeft + ' دقیقې پاتې دي؛ د دې مودې پیغامونه به حذف شي.',
                false,
                stableParticipantJid
              );
              continue;
            }

            // ==========================================
            // د WhatsApp چینلونو فارورډ شوي پوسټونه
            // ==========================================
            if (statusShare && !isFullModerationExempt) {
              await deleteGroupMessage(
                socket,
                groupJid,
                msg.key,
                name,
                '🚫 د WhatsApp Status شریک شوي پوسټونه په ګروپ کې منع دي؛ مهرباني وکړئ معلومات په عادي لیکلي پیغام کې شریک کړئ.',
                true,
                stableParticipantJid
              );
              continue;
            }

            if (channelForward && !isFullModerationExempt) {
              await deleteGroupMessage(
                socket,
                groupJid,
                msg.key,
                name,
                '🚫 د WhatsApp چینلونو فارورډ شوي پوسټونه په ګروپ کې منع دي.',
                true,
                stableParticipantJid
              );
              continue;
            }



            // ==========================================
            // 18.1 د عادي غړو د ډېر چټک پیغامونو مخنیوی
            // ==========================================
            // اډمین د چټکو پیغامونو د شمېر له امله نه حذف کېږي او نه اخطار اخلي.
            // د اډمین لینکونه د رول له مخې اجازه لري؛ د کنځلو او منع شوي فارورډ کنټرولونه لا هم جلا فعال دي.
            if (!isSenderGroupAdmin && !isFullModerationExempt) {
              const burst = recordGroupMessage(groupJid, stableParticipantJid);
              if (burst.count > BURST_LIMIT) {
                if (burst.shouldWarn) burst.markWarned();
                await deleteGroupMessage(
                  socket,
                  groupJid,
                  msg.key,
                  name,
                  '🚫 په لږ وخت کې ډېر پیغامونه لېږل سپم ګڼل کېږي. لږ تم شه او پیغامونه سره راټول کړه.',
                  burst.shouldWarn,
                  stableParticipantJid
                );
                continue;
              }
            }

            // ==========================================
            // 19. د کنځلو او سپکاوي مخنیوی
            // ==========================================

            if (!isFullModerationExempt && containsBadWord(text)) {
              await deleteGroupMessage(
                socket,
                groupJid,
                msg.key,
                name,
                '❌ په ګروپ کې کنځل او سپکاوی منع دي.',
                true,
                stableParticipantJid
              );

              continue;
            }

            // ==========================================
            // 20. د نامجازو لینکونو مخنیوی (فعال؛ د اجازې لېست او د ګروپ اډمینان مستثنا دي)
            // ==========================================

            if (
              ENABLE_LINK_MODERATION &&
              !isFullModerationExempt &&
              LINK_PATTERN.test(text) &&
              !(await isLinkPermittedForSender(
                socket,
                groupJid,
                text,
                [participantJid, msg.key?.participantAlt]
              ))
            ) {
              await deleteGroupMessage(
                socket,
                groupJid,
                msg.key,
                name,
                '🚫 په ګروپ کې د نامجازو لینکونو خپرول منع دي.',
                true,
                stableParticipantJid
              );

              continue;
            }

            // ==========================================
            // 23. سلام ته ځواب
            // ==========================================

            const greetings = [
              'سلام',
              'السلام علیکم',
              'السلامعلیکم',
              'salam',
              'hello',
              'hi',
              'وعلیکم السلام',
            ];

            if (
              text.length <= 60 &&
              greetings.some(
                (greeting) =>
                  lower.startsWith(greeting)
              )
            ) {
              await safeSend(
                socket,
                groupJid,
                {
                  text:
                    `🌍 وعلیکم سلام محترم ${name} جانه! 🌸\n\n` +
                    '🌐 Maloomat AI | معلومات AI ګروپ ته ښه راغلاست. ' +
                    'مهرباني وکړئ د ګروپ اصول مراعات کړئ.',
                }
              );

              continue;
            }

            // ==========================================
            // 24. د عادي غړو د تکراري سپم مخنیوی
            // اډمین د تکرار له شمېر څخه معاف دی؛ نور د کنځلو او لینک اصول پرې هم تطبیقېږي.
            if (!isSenderGroupAdmin && !isFullModerationExempt) {
              const repeated = recordRepeatedMessage(groupJid, stableParticipantJid, text);
              if (repeated.shouldDelete) {
                await deleteGroupMessage(
                  socket,
                  groupJid,
                  msg.key,
                  name,
                  '🚫 د یوه پیغام پرله‌پسې تکرار سپم ګڼل کېږي. مهرباني وکړئ هماغه پیغام بیا بیا مه لېږئ.',
                  repeated.shouldWarn,
                  stableParticipantJid
                );
                continue;
              }
            }

            // د واضح پوښتنو ځواب او انټرنېټي لټون فعال دی؛ عادي خبرې بې‌ځوابه پرېښودل کېږي.
            rememberGroupMember(groupJid, participantJid, name);

            const handledByKnowledge = await answerWithKnowledge(
              socket,
              groupJid,
              participantJid,
              text,
              name
            );

            if (handledByKnowledge) {
              continue;
            }

            // عادي خبرې نه حذف کېږي.

          } catch (err) {
            console.error(
              '❌ د ګروپ پیغام په اداره کولو کې ستونزه:',
              err?.stack || err?.message || err
            );
          }
        }
      }
    );

  } catch (err) {
    console.error(
      '❌ د بوټ د پیل ستونزه:',
      err?.stack || err?.message || err
    );

    scheduleReconnect();

  } finally {
    isStarting = false;
  }
}

// ======================================================
// 25. د بوټ پیل
// ======================================================

// د مهالوېش سیستم د اوسني WhatsApp socket callback له لارې اداره کېږي.
// دا مهال د SillyDev اصلي چلولو چاپېریال کارول کېږي؛ Render ته اړتیا نشته.
startAutoPublisher(() => whatsappConnectionState === 'connected' ? currentSocket : null);

startBot().catch((err) => {
  console.error(
    '❌ د بوټ د پیل عمومي ستونزه:',
    err?.stack || err?.message || err
  );

  scheduleReconnect();
});
