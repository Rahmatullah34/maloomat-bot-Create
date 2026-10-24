'use strict';

const fs = require('fs');
const path = require('path');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  BufferJSON,
  initAuthCreds,
  proto,
} = require('@whiskeysockets/baileys');

const P = require('pino');
const express = require('express');

// ======================================================
// 1. د بوټ HTTP روغتیا او حالت
// ======================================================

const app = express();

app.get('/', (_req, res) => {
  res.status(200).send(
    '🌍 د معلوماتو نړۍ — WhatsApp Group Moderation Bot'
  );
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'maloomat-bot',
    mode: 'group-only-local-knowledge+internet-search',
    ai: false,
    webSearch: true,
    webSearchProvider: 'DuckDuckGo HTML + Wikipedia API fallback',
    knowledgeEntries: OFFLINE_KNOWLEDGE.length,
  });
});

app.get('/keepalive', async (_req, res) => {
  try {
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      await supabaseRest('whatsapp_auth?select=id&limit=1');
    }

    res.status(200).json({
      ok: true,
      service: 'maloomat-bot',
      storage: SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? 'supabase' : 'local',
    });
  } catch (err) {
    console.error('❌ د ذخیرې د روغتیا کتنه ناکامه شوه:', err?.message || err);
    res.status(503).json({ ok: false, storage: 'supabase-unavailable' });
  }
});

app.listen(
  Number(process.env.PORT) || 5000,
  '0.0.0.0',
  () => {
    console.log('✅ د بوټ د روغتیا HTTP خدمت فعال شو.');
  }
);

// ======================================================
// 1.2 د WhatsApp ناستې دوامداره ذخیره (Supabase وړیا ډیټابېس)
// ======================================================

// دا دوه Environment Variables د Supabase د پروژې له معلوماتو اخستل کېږي.
// که دواړه تنظیم نه وي، بوټ پخوانۍ ځايي ذخیره کاروي.
// که یوازې یو تنظیم وي، بوټ په تېروتنه درېږي څو ناسته په غلط ځای کې خوندي نه شي.
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
).trim();

async function supabaseRest(resourcePath, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment variables are not configured.');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${resourcePath}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase HTTP ${response.status}: ${detail.slice(0, 200)}`);
  }

  return response;
}

function serializeAuthValue(value) {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

function deserializeAuthValue(value) {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver);
}

async function useSupabaseAuthState() {
  async function readAuthData(id) {
    const query = 'whatsapp_auth?id=eq.' + encodeURIComponent(id) + '&select=data&limit=1';
    const response = await supabaseRest(query);
    const rows = await response.json();

    if (!Array.isArray(rows) || !rows.length || rows[0].data == null) {
      return null;
    }

    return deserializeAuthValue(rows[0].data);
  }

  async function writeAuthRows(rows) {
    if (!rows.length) return;

    const payload = rows.map(({ id, data }) => ({
      id,
      data: serializeAuthValue(data),
      updated_at: new Date().toISOString(),
    }));

    await supabaseRest('whatsapp_auth?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(payload),
    });
  }

  async function deleteAuthData(id) {
    await supabaseRest('whatsapp_auth?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  }

  const creds = (await readAuthData('creds')) || initAuthCreds();

  const keys = {
    get: async (type, ids) => {
      const result = {};
      await Promise.all(ids.map(async (id) => {
        const value = await readAuthData('key:' + type + ':' + id);
        if (value !== null) result[id] = value;
      }));

      if (type === 'app-state-sync-key') {
        for (const id of Object.keys(result)) {
          result[id] = proto.Message.AppStateSyncKeyData.fromObject(result[id]);
        }
      }

      return result;
    },

    set: async (data) => {
      const rowsToWrite = [];
      const idsToDelete = [];

      for (const [type, entries] of Object.entries(data || {})) {
        for (const [id, value] of Object.entries(entries || {})) {
          const storageId = 'key:' + type + ':' + id;
          if (value == null) {
            idsToDelete.push(storageId);
          } else {
            rowsToWrite.push({ id: storageId, data: value });
          }
        }
      }

      await writeAuthRows(rowsToWrite);
      await Promise.all(idsToDelete.map((id) => deleteAuthData(id)));
    },
  };

  console.log('☁️ د WhatsApp د ناستې معلومات په Supabase کې ساتل کېږي.');

  return {
    state: { creds, keys },
    saveCreds: () => writeAuthRows([{ id: 'creds', data: creds }]),
  };
}

async function getWhatsAppAuthState() {
  const hasUrl = Boolean(SUPABASE_URL);
  const hasKey = Boolean(SUPABASE_SERVICE_ROLE_KEY);

  if (hasUrl !== hasKey) {
    throw new Error('د Supabase دواړه متغیرونه SUPABASE_URL او SUPABASE_SERVICE_ROLE_KEY باید تنظیم وي.');
  }

  if (hasUrl && hasKey) {
    return useSupabaseAuthState();
  }

  // د پخوانۍ ځايي ذخیرې د پاکولو اختیار یوازې په fallback حالت کې کارول کېږي.
  prepareAuthSessionForOneTimeReset();
  console.warn('⚠️ Supabase نه دی تنظیم شوی؛ د WhatsApp ناسته په موقتي local filesystem کې ده.');
  return useMultiFileAuthState(AUTH_DIR);
}

// ======================================================
// ======================================================
// 1.5 محلي معلوماتي سیستم + د انټرنېټ سرچینو لټون (بې له AI API)
// ======================================================

function loadOfflineKnowledge() {
  try {
    const file = path.resolve(process.cwd(), 'knowledge-base-ps.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('⚠️ د معلوماتو فایل ونه لوستل شو:', err?.message || err);
    return [];
  }
}

const OFFLINE_KNOWLEDGE = loadOfflineKnowledge();

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
const SEEN_GROUP_NAMES = new Map();

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
  if (q.length < 2 || !OFFLINE_KNOWLEDGE.length) return null;

  const stopWords = new Set([
    'د', 'په', 'له', 'او', 'یا', 'چې', 'دا', 'هغه', 'دی', 'ده', 'دي',
    'څه', 'څوک', 'څنګه', 'ولې', 'کوم', 'کومه', 'کومې', 'کومو', 'کوي',
    'و', 'وه', 'یې', 'هم', 'راکړه', 'لري', 'شي', 'شوی', 'شوې', 'کې',
    'ته', 'زما', 'ستا', 'ئې', 'دوی', 'دغه', 'داسې', 'یوه', 'یو'
  ]);

  const stem = (token) => String(token || '')
    .replace(/(ونو|ګانو|و|ونه|انو|ونه|ان)$/u, '')
    .replace(/(ی|ه|ي)$/u, '');

  const tokens = (value) => normalizePashto(value)
    .split(' ')
    .map(stem)
    .filter(token => token.length >= 2 && !stopWords.has(token));

  const questionTokens = new Set(tokens(q));
  let best = null;
  let bestScore = 0;

  for (const item of OFFLINE_KNOWLEDGE) {
    const terms = [item.title, ...(Array.isArray(item.keywords) ? item.keywords : [])]
      .filter(Boolean)
      .map(normalizePashto)
      .filter(term => term.length >= 2 && !stopWords.has(term));

    let bestPhraseScore = 0;
    let bestOverlapScore = 0;

    for (const term of terms) {
      const termTokens = tokens(term);

      if (q === term) {
        bestPhraseScore = Math.max(bestPhraseScore, 100 + Math.min(term.length / 20, 5));
        continue;
      }

      // د څو کلمو بشپړ کلیدي عبارت ته تر عمومي ورته والي لوړ لومړیتوب ورکړه.
      if (term.includes(' ') && q.includes(term)) {
        bestPhraseScore = Math.max(bestPhraseScore, 35 + Math.min(term.length / 15, 5));
      } else if (!term.includes(' ') && term.length >= 3 && q.includes(term)) {
        bestPhraseScore = Math.max(bestPhraseScore, 7);
      }

      if (termTokens.length >= 2) {
        const overlap = new Set(termTokens.filter(token => questionTokens.has(token))).size;
        if (overlap >= 2) {
          const coverage = overlap / termTokens.length;
          const candidate = overlap * 3.5 + Math.min(coverage, 1) * 2;
          bestOverlapScore = Math.max(bestOverlapScore, candidate);
        }
      }
    }

    const score = Math.max(bestPhraseScore, bestOverlapScore);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (!best || bestScore < 4) return null;

  return '📚 *' + best.title + '*\n\n' + best.answer +
    (best.source ? '\n\n📖 سرچینه: ' + best.source : '') +
    '\n\nℹ️ دا ځواب د بوټ له ثبت شوو معلوماتو څخه دی. د تازه بدلېدونکو خبرونو او شمېرو لپاره د سرچینې نېټه وګورئ.';
}

function looksLikeQuestion(text) {
  const value = String(text || '').trim();
  if (value.length < 3 || value.length > 1500) return false;
  return /[؟?]/u.test(value) ||
    /(څوک|څه|چېرته|چیرته|څنګه|ولې|څومره|تعریف|معلومات|راکړه|نصاب|درسي پلان|سمستر|کریډیټ|پېژندنه|پیژندنه|خبرونه|تازه|نن|اوسنی|قیمت|بیه|نرخ|انټرنېټ|انټرنټ|ولټوه|لټون|who is|what is|where|when|why|how|latest|today|current|recent|news|price|search online)/iu.test(value);
}

// د ویب لټون لنډمهاله cache د تکراري پوښتنو او غیرضروري غوښتنو مخه نیسي.
const INTERNET_SEARCH_CACHE = new Map();
const INTERNET_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

function decodeWebText(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_m, code) => {
      const n = /^x/i.test(code) ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWebResultUrl(rawUrl) {
  try {
    let url = new URL(rawUrl, 'https://html.duckduckgo.com');
    if ((url.hostname === 'duckduckgo.com' || url.hostname.endsWith('.duckduckgo.com')) &&
        (url.pathname === '/l/' || url.pathname === '/l')) {
      const target = url.searchParams.get('uddg');
      if (target) url = new URL(target);
    }
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.href;
  } catch {
    return '';
  }
}

function parseDuckDuckGoResults(html) {
  const results = [];
  const anchors = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const snippets = [];
  const snippetRe = /<(?:td|div)[^>]*class=["'][^"']*(?:result-snippet|result__snippet)[^"']*["'][^>]*>([\s\S]*?)<\/(?:td|div)>/gi;
  let match;
  while ((match = snippetRe.exec(html)) !== null) {
    snippets.push(decodeWebText(match[1]));
  }

  while ((match = anchors.exec(html)) !== null && results.length < 5) {
    const attrs = match[1];
    const cls = (attrs.match(/\bclass=["']([^"']*)["']/i) || [])[1] || '';
    if (!/(?:result-link|result__a)/i.test(cls)) continue;
    const rawUrl = (attrs.match(/\bhref=["']([^"']+)["']/i) || [])[1];
    const url = normalizeWebResultUrl(rawUrl || '');
    const title = decodeWebText(match[2]);
    if (!url || !title || /duckduckgo\.com/i.test(url)) continue;
    if (results.some(item => item.url === url)) continue;
    results.push({
      title: title.slice(0, 180),
      url,
      snippet: (snippets[results.length] || '').slice(0, 700),
      provider: 'DuckDuckGo',
    });
  }
  return results;
}

async function searchDuckDuckGo(query) {
  const endpoints = [
    'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query),
    'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(query),
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MaloomatBot/1.0; informational search)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) continue;
      const html = await response.text();
      const results = parseDuckDuckGoResults(html);
      if (results.length) return results.slice(0, 4);
    } catch (err) {
      console.warn('⚠️ د ویب لټون یوه هڅه ناکامه شوه:', err?.message || err);
    }
  }
  return [];
}

async function searchWikipedia(query) {
  // د DuckDuckGo د ناکامۍ پر مهال د ویکیپیډیا عامه API د بدیل سرچینې په توګه کارول کېږي.
  const endpoint = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '0',
    gsrwhat: 'text',
    gsrlimit: '4',
    prop: 'extracts|info',
    exintro: '1',
    explaintext: '1',
    exchars: '900',
    inprop: 'url',
    format: 'json',
    origin: '*',
  }).toString();

  try {
    const response = await fetch(endpoint, {
      headers: { 'User-Agent': 'MaloomatBot/1.0 (informational WhatsApp bot)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const pages = Object.values(data?.query?.pages || {})
      .filter(page => page && page.title && page.extract)
      .slice(0, 4);
    return pages.map(page => ({
      title: String(page.title).slice(0, 180),
      url: page.fullurl || ('https://en.wikipedia.org/?curid=' + page.pageid),
      snippet: String(page.extract).slice(0, 700),
      provider: 'Wikipedia',
    }));
  } catch (err) {
    console.warn('⚠️ د ویکیپیډیا لټون ناکام شو:', err?.message || err);
    return [];
  }
}

async function searchInternet(query) {
  const normalized = normalizePashto(query);
  if (!normalized || normalized.length < 2) return [];
  const now = Date.now();
  const cached = INTERNET_SEARCH_CACHE.get(normalized);
  if (cached && now - cached.time < INTERNET_SEARCH_CACHE_TTL_MS) return cached.results;

  let results = await searchDuckDuckGo(query);
  if (!results.length) results = await searchWikipedia(query);

  INTERNET_SEARCH_CACHE.set(normalized, { time: now, results });
  if (INTERNET_SEARCH_CACHE.size > 150) {
    const oldestKey = INTERNET_SEARCH_CACHE.keys().next().value;
    if (oldestKey) INTERNET_SEARCH_CACHE.delete(oldestKey);
  }
  return results;
}

function requestsInternetSearch(question) {
  return /(انټرنېټ|انټرنټ|ویب کې|ویبپاڼ|سرچینې|انلاین|ولټوه|لټون وکړه|تازه معلومات|وروستي خبرونه|search online|search the web|internet search|web search|look up online)/iu.test(question);
}

function isTimeSensitiveQuestion(question) {
  return /(نن|نننۍ|نن ورځ|اوس|اوسنی|اوسنۍ|تازه|وروستی|وروستۍ|خبرونه|خبر|اوسمهال|بیه|قیمت|نرخ|د هوا|هوا څنګه|today|latest|current|recent|breaking|news|price|exchange rate|weather|score|standings)/iu.test(question);
}

function formatInternetResults(question, results) {
  const entries = results.slice(0, 4).map((item, index) => {
    const snippet = item.snippet || 'لنډه تشریح نه ده موندل شوې؛ د بشپړ معلوماتو لپاره سرچینه پرانیزئ.';
    return '*' + (index + 1) + '. ' + item.title + '*\n' +
      snippet + '\n🔗 ' + item.url;
  });
  return '🌐 *د انټرنېټ د سرچینو لټون*\n' +
    '🔎 پوښتنه: ' + String(question).trim().slice(0, 250) + '\n\n' +
    entries.join('\n\n') +
    '\n\n⚠️ دا د لټون پایلې او لنډې اقتباس شوې تشریحګانې دي؛ د سرچینې بشپړ متن او د خپرېدو نېټه په خپله لینک کې وګورئ.';
}

async function answerWithKnowledge(socket, groupJid, participantJid, question, participantName) {
  const identityAnswer = answerIdentityQuestion(
    groupJid, participantJid, participantName, question
  );
  if (identityAnswer) {
    await safeSend(socket, groupJid, { text: identityAnswer });
    return true;
  }

  const localAnswer = answerFromOfflineKnowledge(question);
  const shouldSearchInternet = requestsInternetSearch(question) ||
    isTimeSensitiveQuestion(question) || !localAnswer;

  if (!looksLikeQuestion(question) && !localAnswer && !requestsInternetSearch(question)) return false;

  if (shouldSearchInternet) {
    const webResults = await searchInternet(question);
    if (webResults.length) {
      let message = formatInternetResults(question, webResults);
      if (localAnswer && isTimeSensitiveQuestion(question)) {
        message += '\n\n📚 *د بوټ له ثبت شوو معلوماتو څخه:*\n' + localAnswer;
      }
      await safeSend(socket, groupJid, { text: message });
      return true;
    }
  }

  if (localAnswer) {
    const message = isTimeSensitiveQuestion(question)
      ? localAnswer + '\n\n⚠️ د انټرنېټ لټون دا ځل پایلې راونه وېستلې؛ د تازه معلوماتو لپاره د سرچینې نېټه جلا وګورئ.'
      : localAnswer;
    await safeSend(socket, groupJid, { text: message });
    return true;
  }

  if (!looksLikeQuestion(question) && !requestsInternetSearch(question)) return false;

  await safeSend(socket, groupJid, {
    text: '📚 په محلي معلوماتي زېرمه کې د دې پوښتنې کره ځواب ونه موندل شو، او د انټرنېټ لټون هم پایلې ترلاسه نه کړې.\n\n' +
      '🌐 بیا هڅه وکړئ، پوښتنه لږ مشخصه ولیکئ، یا د سرچینې لینک د ګروپ له غړو سره شریک کړئ. ' +
      'د انټرنېټ د لټون پایلې تل د سرچینې د اعتبار او نېټې له کتلو وروسته وکاروئ.'
  });
  return true;
}

// 2. د WhatsApp تنظیمات
// ======================================================

// د WhatsApp شمېره د هېواد له کوډ سره ولیکه؛ د پیل + مه کاروه.
// که WHATSAPP_PHONE په Startup کې نه وي، بوټ یې له whatsapp-phone.txt فایل څخه اخلي.
// د whatsapp-phone.txt فایل یوازې په سرور کې جوړ کړه؛ GitHub ته یې مه پورته کوه.

function readPhoneFromFile() {
  try {
    return fs.readFileSync(
      path.resolve(process.cwd(), 'whatsapp-phone.txt'),
      'utf8'
    ).trim();
  } catch {
    return '';
  }
}

const PHONE = String(
  process.env.WHATSAPP_PHONE || readPhoneFromFile() || ''
).replace(/\D/g, '');

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
  const resetRequested = /^(1|true|yes)$/i.test(
    String(
      process.env.RESET_WHATSAPP_SESSION || ''
    ).trim()
  );

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
// 4. د منع شویو کلیمو او سپکاوي لېست
// ======================================================

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

// ======================================================
// 5. د ګروپ رسمي قوانین
// ======================================================

const GROUP_RULES = `📜 *د معلوماتو نړۍ — د ګروپ رسمي قوانین* 📜

1️⃣ *ګټور معلومات:* علمي پوښتنې او ګټور معلومات شریک کړئ.

2️⃣ *د غړو درناوی:* کنځل، سپکاوی او ځورول منع دي.

3️⃣ *د لینکونو خپرول:* نامجاز او تبلیغاتي لینکونه مه خپروئ.

4️⃣ *د پیغامونو نظم:* پرله‌پسې ډېر لنډ پیغامونه مه استوئ؛ خبرې په یوه پیغام کې راټولې کړئ.

5️⃣ *همکاري:* له ټولو غړو هیله کېږي چې قوانین مراعات کړي.

🤝 د همکارۍ مننه!`;

// ======================================================
// 6. د سپکاوي پېژندل
// ======================================================

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

// ======================================================
// 7. د لینکونو پېژندل
// ======================================================

const LINK_PATTERN =
  /(?:https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me\/|t\.me\/|facebook\.com|fb\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|snapchat\.com|x\.com|twitter\.com|(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|info|app|site|me|ly|dev|ai|xyz|online|shop|tech|af|us|uk)\b)/i;

// یادونه: دا پېژندنه د متن په مرسته کېږي؛
 // ټول ممکن لینکونه او ټولې کنځلې نه شي پېژندلای.

// ======================================================
// 8. د WhatsApp پیغام متن ترلاسه کول
// ======================================================

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

// ======================================================
// 9. د تکراري پیغامونو مخنیوی
// ======================================================

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

// ======================================================
// 10. په ۳۰ ثانیو کې د پیغامونو شمېر
// ======================================================

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

    return await socket.sendMessage(
      jid,
      content
    );

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
  reason
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

  const statusText = deleted
    ? 'د پیغام د حذف غوښتنه واستول شوه.'
    : 'د پیغام حذف تایید نه شو؛ د بوټ د مدیر اجازه او د اتصال حالت وګوره.';

  await safeSend(socket, jid, {
    text:
      `⚠️ محترم ${participantName} جانه!\n\n` +
      `${reason}\n` +
      `${statusText}\n` +
      'مهرباني وکړئ د ګروپ قوانین مراعات کړئ. 🤝',
  });
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

        if (connection === 'open') {
          console.log(
            '✅ د معلوماتو نړۍ WhatsApp بوټ فعال شو!'
          );

          console.log(
            '📚 یوازې ګروپونه؛ د AI پرته محلي معلومات فعال دي. د معلوماتو شمېر: ' +
            OFFLINE_KNOWLEDGE.length
          );

          if (pairingTimer) {
            clearTimeout(pairingTimer);
            pairingTimer = null;
          }
        }

        if (connection === 'close') {
          if (pairingTimer) {
            clearTimeout(pairingTimer);
            pairingTimer = null;
          }

          if (currentSocket === socket) {
            currentSocket = null;
          }

          const statusCode =
            lastDisconnect?.error?.output?.statusCode;

          console.error(
            '⚠️ د WhatsApp اتصال بند شو؛ حالت:',
            statusCode || 'نامعلوم'
          );

          if (
            statusCode === DisconnectReason.loggedOut
          ) {
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
          if (
            event.action !== 'add' ||
            !Array.isArray(event.participants)
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
                  `🌍 سلام @${number} جانه!\n\n` +
                  'د معلوماتو نړۍ ګروپ ته ښه راغلاست! 🌸\n\n' +
                  GROUP_RULES,

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
            if (
              !msg?.message ||
              msg.key?.fromMe
            ) {
              continue;
            }

            const groupJid =
              msg.key?.remoteJid;

            if (
              !groupJid ||
              groupJid === 'status@broadcast' ||
              groupJid.endsWith('@newsletter')
            ) {
              continue;
            }

            // شخصي چټ بشپړ بند دی.
            if (!groupJid.endsWith('@g.us')) {
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

            if (!text) {
              continue;
            }

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

            console.log(
              `📩 ګروپي پیغام؛ غړی=${name}; ` +
              `متن=${text.slice(0, 100)}`
            );

            // ==========================================
            // 19. د کنځلو او سپکاوي مخنیوی
            // ==========================================

            if (containsBadWord(text)) {
              await deleteGroupMessage(
                socket,
                groupJid,
                msg.key,
                name,
                '❌ په ګروپ کې کنځل او سپکاوی منع دي.'
              );

              continue;
            }

            // ==========================================
            // 20. د لینکونو مخنیوی
            // ==========================================

            if (LINK_PATTERN.test(text)) {
              await deleteGroupMessage(
                socket,
                groupJid,
                msg.key,
                name,
                '🚫 په ګروپ کې د نامجازو لینکونو خپرول منع دي.'
              );

              continue;
            }

            // ==========================================
            // 22. د قوانینو غوښتنه
            // ==========================================

            const ruleCommands = [
              'قوانین',
              'قانون',
              'د ګروپ قوانین',
              'د ګروپ قانون',
              'rules',
              'group rules',
            ];

            if (ruleCommands.includes(cleanText)) {
              await safeSend(
                socket,
                groupJid,
                {
                  text:
                    `📜 محترم ${name} جانه!\n\n` +
                    GROUP_RULES,
                }
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
                    'د معلوماتو نړۍ ګروپ ته ښه راغلاست. ' +
                    'مهرباني وکړئ د ګروپ اصول مراعات کړئ.',
                }
              );

              continue;
            }

            // ==========================================
            // 24. د محلي معلوماتو ځواب
            // ==========================================

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

            // ==========================================
            // 25. نور عادي پیغامونه
            // ==========================================

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

startBot().catch((err) => {
  console.error(
    '❌ د بوټ د پیل عمومي ستونزه:',
    err?.stack || err?.message || err
  );

  scheduleReconnect();
});
