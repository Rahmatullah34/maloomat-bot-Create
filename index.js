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

// د محلي ځوابونو او د ثابتو معلوماتو زېرمه په lib/local-knowledge.js کې جلا ساتل کېږي.
const {
  OFFLINE_KNOWLEDGE,
  rememberGroupMember,
  answerIdentityQuestion,
  answerFromOfflineKnowledge,
  answerSimpleMathQuestion,
  answerCommonPashtoQuestion,
  isSensitiveSafetyRequest,
} = require('./lib/local-knowledge');


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
