'use strict';

// =====================================================
// د ګروپ د نظم ساتنې خالصې (pure) کړنې او حالت
// دا برخه له index.js جلا شوې څو په ازموینو کې و ازمویل شي.
// =====================================================

// د اجازې لرونکو ګروپونو لېست (اختیاري).
// ALLOWED_GROUPS چاپېریالي متغیر کې د ګروپونو JID سره په کاما جلا کړئ.
// که تش وي، بوټ په ټولو ګروپونو کې کار کوي (پخوانی چلند).
const ALLOWED_GROUPS = new Set(
  String(process.env.ALLOWED_GROUPS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

function isGroupAllowed(groupJid) {
  if (!ALLOWED_GROUPS.size) return true;
  return ALLOWED_GROUPS.has(String(groupJid || ''));
}

function allowedGroupsCount() {
  return ALLOWED_GROUPS.size;
}

// د پخواني تاریخ د پاکولو کېنچ (اختیاري).
// ENABLE_HISTORY_CLEANUP=false ونيسي که غواړئ د پخوانیو پیغامونو لینکونه نه حذف شي.
const HISTORY_CLEANUP_ENABLED = !/^(0|false|no)$/i.test(
  String(process.env.ENABLE_HISTORY_CLEANUP || '').trim()
);

function isHistoryCleanupEnabled() {
  return HISTORY_CLEANUP_ENABLED;
}

function normalizePashto(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[؟?!،,.:؛()\[\]{}"'«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// د ګروپ د قوانینو امرونه د پښتو/عربي تورو د توپیر او اضافي نښو باوجود پېژني.
// دا امر د سپم، کنځلو او لینک د اخطارونو تر مخه اجرا کېږي.
const GROUP_RULE_COMMANDS = new Set([
  'قوانین',
  'قانون',
  'د ګروپ قوانین',
  'د ګروپ قانون',
  'rules',
  'group rules',
].map(normalizePashto));

function isGroupRulesCommand(text) {
  return GROUP_RULE_COMMANDS.has(normalizePashto(text));
}

// =====================================================
// د منع شویو کلیمو او سپکاوي لېست
// =====================================================

const BAD_WORDS = [
  // پښتو سپکاوی
  'احمق',
  'بې‌عقله',
  'بی‌عقله',
  'بې عقله',
  'بی عقله',
  'بې‌شعوره',
  'بی‌شعوره',
  'بې شعوره',
  'بی شعوره',
  'بې‌ادبه',
  'بی‌ادبه',
  'بې ادبه',
  'بی ادبه',
  'بې‌غیرته',
  'بی‌غیرته',
  'بې غیرته',
  'بی غیرته',
  'بی ناموس',
  'بې ناموس',
  'بی‌ناموس',
  'بې‌ناموس',
  'حرامزاده',
  'حرامي',
  'حرامی',
  'ولدالحرام',
  'پدرسوخته',
  'مادرجنده',
  'مادر جنده',
  'مادر قحبه',
  'خواهر جنده',
  'جنده',
  'کونی',
  'کوس',
  'کسکش',
  'کس کش',
  'چوتیا',
  'چوټیا',
  'سګ دې',
  'خره',
  'لعنتي',

  // دري او فارسي سپکاوی
  'بی‌شرف',
  'بیشرف',
  'بی شرف',
  'بی‌حیا',
  'بی حیا',
  'گم شو',
  'گمشو',
  'گاو',
  'کثافت',
  'آشغال',
  'پست فطرت',
  'پست‌فطرت',
  'مادر به خطا',
  'مادرخطا',
  'حرام خور',
  'حرام‌خور',
  'کثیف',
  'خبیث',
  'لعنت بر تو',

  // انګلیسي
  'fuck',
  'fucking',
  'motherfucker',
  'mother fucker',
  'shit',
  'bullshit',
  'bitch',
  'son of a bitch',
  'asshole',
  'dickhead',
  'dick',
  'pussy',
  'bastard',
  'slut',
  'whore',
  'damn you',
  'idiot',
  'moron',
];

function containsBadWord(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .normalize('NFKC');

  return BAD_WORDS.some((word) => {
    const escaped = word.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

    const flexible = escaped.replace(
      /\s+/g,
      '\\s+'
    );

    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${flexible}($|[^\\p{L}\\p{N}])`,
      'iu'
    );

    return pattern.test(normalized);
  });
}

// =====================================================
// د لینکونو پېژندل
// =====================================================

const LINK_PATTERN =
  /(?:https?:\/\/|www\.|wa\.me\/|t\.me\/|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{2,5})?(?:\/[^\s]*)?)/i;

// =====================================================
// د اجازې لرونکو لینکونو لار
// =====================================================

// که ALLOWED_LINK_DOMAINS وتړئ (د ډومېنونو لېست سره په کاما جلا)،
// د دې ډومېنونو لینکونه نه حذفیږي — د ګروپ د ادارې اجازې سره سمون.
const ALLOWED_LINK_DOMAINS = new Set(
  String(process.env.ALLOWED_LINK_DOMAINS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase().replace(/^www\./, ''))
    .filter(Boolean)
);

// د دې اډمین لینکونه همېشه اجازه لري؛ محلي او نړیوال نمبر دواړه پېژندل کېږي.
function normalizeSenderIdentifier(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const identifier = raw.includes('@') ? raw.split('@')[0] : raw;
  const numberPart = identifier.split(':')[0];
  const digits = numberPart.replace(/\D/g, '');

  if (!digits) return raw;
  // افغانستان: +93XXXXXXXXX او 0XXXXXXXXX په یوه محلي بڼه برابرول.
  if (digits.startsWith('93') && digits.length === 11) {
    return `0${digits.slice(2)}`;
  }
  if (digits.length === 9) {
    return `0${digits}`;
  }
  return digits;
}

// د باوري شمېرې د پېژندلو لپاره یوازې د تلیفون JID منل کېږي؛ @lid شمېرې نه دي.
// نړیوال 93 او محلي 0 بڼې یوه معیاري بڼه ته اړوي.
function normalizeWhatsAppPhoneNumber(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || /@lid$/i.test(raw)) return '';

  let numberPart = raw;
  const atIndex = raw.lastIndexOf('@');
  if (atIndex >= 0) {
    const domain = raw.slice(atIndex + 1);
    if (!['s.whatsapp.net', 'c.us', 'whatsapp.net'].includes(domain)) return '';
    numberPart = raw.slice(0, atIndex);
  }

  const digits = numberPart.split(':')[0].replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('93') && digits.length === 11) return `0${digits.slice(2)}`;
  if (digits.length === 9) return `0${digits}`;
  return digits;
}

function hasMatchingPhoneNumber(senderIdentifiers, expectedPhoneNumbers) {
  const expectedValues = Array.isArray(expectedPhoneNumbers)
    ? expectedPhoneNumbers
    : [expectedPhoneNumbers];
  const expected = new Set(expectedValues.map(normalizeWhatsAppPhoneNumber).filter(Boolean));
  if (!expected.size) return false;

  const identifiers = Array.isArray(senderIdentifiers) ? senderIdentifiers : [senderIdentifiers];
  return identifiers.some((value) => {
    const phoneNumber = normalizeWhatsAppPhoneNumber(value);
    return Boolean(phoneNumber && expected.has(phoneNumber));
  });
}

const DEFAULT_ALLOWED_LINK_SENDERS = ['0707285093'];
const configuredLinkSenders = String(process.env.ALLOWED_LINK_SENDERS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const ALLOWED_LINK_SENDERS = new Set(
  [...DEFAULT_ALLOWED_LINK_SENDERS, ...configuredLinkSenders]
    .flatMap((value) => {
      const raw = String(value || '').trim();
      const normalized = normalizeSenderIdentifier(raw);
      return [raw, normalized].filter(Boolean);
    })
);

function extractUrlHost(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

// که لینک اجازه لري، true راګرځي؛ نو پیغام نه حذفیږي.
function isLinkPermitted(text, senderJid) {
  const sender = String(senderJid || '').trim();
  if (
    ALLOWED_LINK_SENDERS.has(sender) ||
    ALLOWED_LINK_SENDERS.has(normalizeSenderIdentifier(sender))
  ) {
    return true;
  }

  if (!ALLOWED_LINK_DOMAINS.size) {
    return false;
  }

  const rawText = String(text || '');
  const urlMatches = rawText.match(/https?:\/\/[^\s]+|www\.[^\s]+/gi) || [];

  return urlMatches.some((rawUrl) => {
    const host = extractUrlHost(rawUrl.startsWith('www.') ? 'https://' + rawUrl : rawUrl);
    return ALLOWED_LINK_DOMAINS.has(host);
  });
}

// په LID/PN او device-address بڼو کې د یوه غړي JID برابرول.
function canonicalizeJidForMatch(value) {
  const raw = String(value || '').trim().toLowerCase();
  const atIndex = raw.lastIndexOf('@');
  if (atIndex < 0) return raw;
  return `${raw.slice(0, atIndex).split(':')[0]}@${raw.slice(atIndex + 1)}`;
}

// د phone JID او phoneNumber فیلډ بېلابېلې بڼې د پرتله کولو لپاره برابرول.
// @lid په شمېره نه بدلېږي؛ له @lid سره یوازې هماغه LID پېژندپاڼه برابرېږي.
function participantIdentifierKeys(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return [];

  const canonical = canonicalizeJidForMatch(raw);
  const atIndex = canonical.lastIndexOf('@');
  if (atIndex >= 0) {
    const domain = canonical.slice(atIndex + 1);
    const keys = [`jid:${canonical}`];
    if (['s.whatsapp.net', 'c.us', 'whatsapp.net'].includes(domain)) {
      const phone = normalizeSenderIdentifier(canonical);
      if (phone) keys.push(`phone:${phone}`);
    }
    return keys;
  }

  // د metadata.phoneNumber ارزښت کله ناکله له @domain پرته راځي.
  if (/^[+\d\s().-]+$/.test(raw)) {
    const phone = normalizeSenderIdentifier(raw);
    return phone ? [`phone:${phone}`] : [];
  }

  return [`raw:${raw}`];
}

// د ټولو شته PN/LID پېژندپاڼو له مخې د ګروپ غړی پیدا کوي.
function findGroupParticipant(participants, senderIdentifiers) {
  const senderKeys = new Set(
    (Array.isArray(senderIdentifiers) ? senderIdentifiers : [])
      .flatMap(participantIdentifierKeys)
  );
  if (!senderKeys.size) return null;

  return (Array.isArray(participants) ? participants : []).find((participant) => {
    const candidateIds = [
      participant?.id,
      participant?.jid,
      participant?.lid,
      participant?.phoneNumber,
    ];
    return candidateIds
      .flatMap(participantIdentifierKeys)
      .some((key) => senderKeys.has(key));
  }) || null;
}

function isGroupAdminParticipant(participant) {
  if (!participant) return false;
  const role = String(participant.admin || '').toLowerCase();
  return role === 'admin' ||
    role === 'superadmin' ||
    participant.admin === true ||
    participant.isAdmin === true ||
    participant.isSuperAdmin === true;
}

// د یوه غړي ثابت کلید جوړوي، څو کله چې WhatsApp PN او LID په بېلابېلو
// ترتیبونو کې راولېږي، د سپم شمېر او اخطارونه د هماغه غړي لپاره پاتې شي.
function getCanonicalParticipantIdentifier(participants, senderIdentifiers) {
  const matched = findGroupParticipant(participants, senderIdentifiers);
  const values = matched
    ? [
        matched.phoneNumber,
        matched.id,
        matched.jid,
        matched.lid,
        ...(Array.isArray(senderIdentifiers) ? senderIdentifiers : []),
      ]
    : (Array.isArray(senderIdentifiers) ? senderIdentifiers : []);

  const keys = [...new Set(values.flatMap(participantIdentifierKeys))];
  const phoneKey = keys.find((key) => key.startsWith('phone:'));
  if (phoneKey) return phoneKey;

  const lidKey = keys.filter((key) => key.startsWith('jid:') && key.endsWith('@lid')).sort()[0];
  if (lidKey) return lidKey;

  const jidKey = keys.filter((key) => key.startsWith('jid:')).sort()[0];
  if (jidKey) return jidKey;

  return keys.sort()[0] || 'unknown-member';
}

// که د پیغام استوونکی په ګروپ کې اډمین وي، true راګرځوي.
// د id/lid/phoneNumber ټول بدیلونه او د Baileys admin flags ګوري؛ pushName نه کاروي.
function isGroupAdminSender(participants, senderIdentifiers) {
  return isGroupAdminParticipant(
    findGroupParticipant(participants, senderIdentifiers)
  );
}


// =====================================================
// د پیغام د متن ترلاسه کول او د ډول پېژندل
// =====================================================

// د نقل شوې (quoted) محتوا کیلي: د عادي غبرګون د پیغام دننه د پخواني
// پیغام کاپي پلټل غلطي کوي؛ نو یوازې د راتلونکي پیغام اصلي برخه پلټوو.
const SKIPPED_SCAN_KEYS = new Set(['quotedMessage']);

function scanMessageKeys(message, targetKeys) {
  const visited = new Set();
  let inspected = 0;

  function scan(value, depth) {
    if (!value || typeof value !== 'object' || depth > 14 ||
        visited.has(value) || inspected >= 800) {
      return false;
    }

    visited.add(value);
    inspected += 1;

    for (const [key, child] of Object.entries(value)) {
      if (targetKeys.has(key) &&
          child !== undefined && child !== null && child !== false && child !== '') {
        return true;
      }

      // د پخواني پیغام نقل شوې برخه له پلټنې وباسه؛
      // دا د غبرګون پیغام نه دی، بلکه هغه پیغام دی چې غبرګون پرې شوې.
      if (SKIPPED_SCAN_KEYS.has(key)) {
        continue;
      }

      if (child && typeof child === 'object' && scan(child, depth + 1)) {
        return true;
      }
    }
    return false;
  }

  return scan(message, 0);
}

function isForwardedChannelMessage(message) {
  // Channel-forward metadata may sit inside media contextInfo or another
  // wrapped section of the message. Scan the whole Baileys message safely.
  const channelMetadataKeys = new Set([
    'forwardedNewsletterMessageInfo',
    'forwardedNewsletterMessage',
    'newsletterJid',
    'newsletterServerId',
    'newsletterMessageId',
  ]);

  return scanMessageKeys(message, channelMetadataKeys);
}

function isWhatsAppStatusShare(message) {
  // د WhatsApp د Status شریکولو پیغامونه ښايي د عادي متن پر ځای د ځانګړي
  // Baileys message type په بڼه راشي، نو یوازې extractText پرې بسنه نه کوي.
  const statusMessageKeys = new Set([
    'groupStatusMentionMessage',
    'statusMentionMessage',
    'statusMentionMessageV2',
    'statusMentionMessageV3',
    'statusMentionMessageV4',
    'statusMentionMessageInfo',
  ]);

  return scanMessageKeys(message, statusMessageKeys);
}

// WhatsApp لایک/غبرګون په reactionMessage کې راځي؛ د عادي پیغام په څېر
// یې د سپم شمېر، حذف یا اخطار لپاره مه حسابوه. scanMessageKeys د نقل شوې
// quotedMessage محتوا له پلټنې باسي، څو د عادي ځواب دننه غبرګون غلط ونه نیول شي.
function isReactionMessage(message) {
  return scanMessageKeys(message, new Set(['reactionMessage']));
}

function extractText(message) {
  let content = message;

  for (let i = 0; i < 6 && content; i += 1) {
    const wrapped =
      content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.viewOnceMessageV2Extension?.message ||
      content.documentWithCaptionMessage?.message;

    if (!wrapped) {
      break;
    }

    content = wrapped;
  }

  return String(
    content?.conversation ||
    content?.extendedTextMessage?.text ||
    content?.imageMessage?.caption ||
    content?.videoMessage?.caption ||
    content?.documentMessage?.caption ||
    content?.buttonsResponseMessage?.selectedDisplayText ||
    content?.listResponseMessage?.title ||
    content?.templateButtonReplyMessage?.selectedDisplayText ||
    content?.interactiveResponseMessage?.body?.text ||
    ''
  ).trim();
}

// =====================================================
// د پوښتنې پېژندل (د ځوابونو برخه موقتي بندې ده)
// =====================================================

function looksLikeQuestion(text) {
  const raw = String(text || '').trim();
  if (raw.length < 2 || raw.length > 700) return false;
  // د ځواب یا ویب لټون لپاره د پیغام په پای کې د پوښتنې نښه حتمي ده.
  return /[؟?]\s*["'»”’)}\]]*$/u.test(raw);
}

// =====================================================
// د پیغامونو د تکرار مخنیوی (حالت)
// =====================================================

const seenMessages = new Map();

function rememberMessage(id) {
  const now = Date.now();

  for (const [key, time] of seenMessages) {
    if (now - time > 5 * 60 * 1000) {
      seenMessages.delete(key);
    }
  }

  if (seenMessages.has(id)) {
    return false;
  }

  seenMessages.set(id, now);

  if (seenMessages.size > 1000) {
    const oldestKey =
      seenMessages.keys().next().value;

    if (oldestKey) {
      seenMessages.delete(oldestKey);
    }
  }

  return true;
}

// =====================================================
// په ۳۰ ثانیو کې د پیغامونو شمېر
// =====================================================

const messageBursts = new Map();

const BURST_WINDOW_MS = 30 * 1000;
const BURST_LIMIT = 3;
const BURST_WARNING_COOLDOWN_MS = 30 * 1000;

function recordGroupMessage(
  groupJid,
  participantJid
) {
  const now = Date.now();

  const key = `${groupJid}:${participantJid}`;

  let entry = messageBursts.get(key);

  if (!entry) {
    entry = {
      timestamps: [],
      lastWarnAt: 0,
      lastSeenAt: now,
    };
  }

  entry.timestamps = entry.timestamps.filter(
    (time) => now - time < BURST_WINDOW_MS
  );

  entry.timestamps.push(now);
  entry.lastSeenAt = now;

  for (const [oldKey, oldEntry] of messageBursts) {
    if (
      now - oldEntry.lastSeenAt >
      10 * 60 * 1000
    ) {
      messageBursts.delete(oldKey);
    }
  }

  messageBursts.set(key, entry);

  return {
    count: entry.timestamps.length,

    shouldWarn:
      entry.timestamps.length >= BURST_LIMIT &&
      now - entry.lastWarnAt >=
        BURST_WARNING_COOLDOWN_MS,

    markWarned: () => {
      entry.lastWarnAt = Date.now();
    },
  };
}

// =====================================================
// د ورته تکراري پیغامونو مخنیوی
// =====================================================

const repeatedMessages = new Map();
const REPEAT_WINDOW_MS = 60 * 1000;
const REPEAT_LIMIT = 3;

function recordRepeatedMessage(groupJid, participantJid, text) {
  const normalized = String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();

  // ډېر لنډ پیغامونه، لکه سلام او هو، د تکراري سپم په توګه نه شمېرل کېږي.
  if (normalized.length < 8) {
    return { shouldDelete: false, shouldWarn: false, count: 0 };
  }

  const now = Date.now();
  const key = `${groupJid}:${participantJid}:${normalized.slice(0, 300)}`;
  let entry = repeatedMessages.get(key);

  if (!entry) entry = { timestamps: [], lastWarnAt: 0, lastSeenAt: now };
  entry.timestamps = entry.timestamps.filter(time => now - time < REPEAT_WINDOW_MS);
  entry.timestamps.push(now);
  entry.lastSeenAt = now;
  repeatedMessages.set(key, entry);

  for (const [oldKey, oldEntry] of repeatedMessages) {
    if (now - oldEntry.lastSeenAt > 10 * 60 * 1000) repeatedMessages.delete(oldKey);
  }
  if (repeatedMessages.size > 2000) {
    const oldestKey = repeatedMessages.keys().next().value;
    if (oldestKey) repeatedMessages.delete(oldestKey);
  }

  const shouldDelete = entry.timestamps.length >= REPEAT_LIMIT;
  const shouldWarn = shouldDelete && now - entry.lastWarnAt >= BURST_WARNING_COOLDOWN_MS;
  if (shouldWarn) entry.lastWarnAt = now;

  return { shouldDelete, shouldWarn, count: entry.timestamps.length };
}

// =====================================================
// د سرغړونو اخطارونه او شریک throttle
// =====================================================

const violationWarnings = new Map();
const VIOLATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const SHARED_WARNING_COOLDOWN_MS = 30 * 1000;
const sharedWarningThrottle = new Map();

// د درېیم اخطار وروسته د غړي لنډمهاله محدودیت؛ په دې موده کې به د هغه پیغامونه حذفېږي.
const TEMPORARY_MUTE_DEFAULT_MS = 2 * 60 * 60 * 1000;
const temporaryMutes = new Map();

function setTemporaryMute(groupJid, participantJid, durationMs = TEMPORARY_MUTE_DEFAULT_MS) {
  const duration = Number(durationMs);
  if (!Number.isFinite(duration) || duration <= 0) return null;

  const now = Date.now();
  const key = String(groupJid) + ':' + String(participantJid || 'unknown');
  const expiresAt = now + Math.min(duration, 24 * 60 * 60 * 1000);
  temporaryMutes.set(key, { expiresAt });

  for (const [oldKey, entry] of temporaryMutes) {
    if (entry.expiresAt <= now) temporaryMutes.delete(oldKey);
  }
  while (temporaryMutes.size > 3000) {
    const oldestKey = temporaryMutes.keys().next().value;
    if (!oldestKey) break;
    temporaryMutes.delete(oldestKey);
  }

  return { expiresAt, remainingMs: expiresAt - now };
}

function getTemporaryMuteStatus(groupJid, participantJid) {
  const key = String(groupJid) + ':' + String(participantJid || 'unknown');
  const entry = temporaryMutes.get(key);
  if (!entry) return null;

  const remainingMs = entry.expiresAt - Date.now();
  if (remainingMs <= 0) {
    temporaryMutes.delete(key);
    return null;
  }

  return { expiresAt: entry.expiresAt, remainingMs };
}

function recordViolationWarning(groupJid, participantJid) {
  const now = Date.now();
  const key = String(groupJid) + ':' + String(participantJid || 'unknown');
  const previous = violationWarnings.get(key);

  const entry = previous && now - previous.firstAt < VIOLATION_WINDOW_MS
    ? { count: previous.count + 1, firstAt: previous.firstAt, lastAt: now }
    : { count: 1, firstAt: now, lastAt: now };

  violationWarnings.set(key, entry);

  for (const [oldKey, oldEntry] of violationWarnings) {
    if (now - oldEntry.lastAt > VIOLATION_WINDOW_MS) {
      violationWarnings.delete(oldKey);
    }
  }

  if (violationWarnings.size > 3000) {
    const oldestKey = violationWarnings.keys().next().value;
    if (oldestKey) violationWarnings.delete(oldestKey);
  }

  return entry.count;
}

// شریک throttle: که یو غړي ته په وروستيو ۳۰ ثانیو کې اخطار استول شوی وي،
// نوی اخطار نه استوي — دې سره د بوټ له اخطارونو سپم نه جوړیږي.
function shouldSendWarningNow(groupJid, participantJid) {
  const now = Date.now();
  const key = String(groupJid) + ':' + String(participantJid || 'unknown');
  const last = sharedWarningThrottle.get(key);

  if (last && now - last < SHARED_WARNING_COOLDOWN_MS) {
    return false;
  }

  sharedWarningThrottle.set(key, now);

  for (const [oldKey, oldTime] of sharedWarningThrottle) {
    if (now - oldTime > VIOLATION_WINDOW_MS) {
      sharedWarningThrottle.delete(oldKey);
    }
  }
  if (sharedWarningThrottle.size > 3000) {
    const oldestKey = sharedWarningThrottle.keys().next().value;
    if (oldestKey) sharedWarningThrottle.delete(oldestKey);
  }

  return true;
}

module.exports = {
  isGroupAllowed,
  allowedGroupsCount,
  isHistoryCleanupEnabled,
  normalizePashto,
  hasMatchingPhoneNumber,
  isGroupRulesCommand,
  BAD_WORDS,
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
  BURST_LIMIT,
  BURST_WARNING_COOLDOWN_MS,
  recordViolationWarning,
  shouldSendWarningNow,
  isLinkPermitted,
  findGroupParticipant,
  isGroupAdminParticipant,
  getCanonicalParticipantIdentifier,
  isGroupAdminSender,
};
