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
// 1. د Render سرور
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
    mode: 'group-only',
    ai: Boolean(OPENROUTER_API_KEY),
    webSearch: Boolean(TAVILY_API_KEY),
    model: process.env.OPENROUTER_MODEL || 'openrouter/free',
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
    console.log('✅ د Render سرور فعال شو.');
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
// 1.5 د Gemini AI او تازه معلوماتو ځوابونه
// ======================================================

function readOpenRouterApiKeyFromFile() {
  try {
    return fs.readFileSync(
      path.resolve(process.cwd(), 'openrouter-api-key.txt'),
      'utf8'
    ).trim();
  } catch {
    return '';
  }
}

function readTavilyApiKeyFromFile() {
  try {
    return fs.readFileSync(
      path.resolve(process.cwd(), 'tavily-api-key.txt'),
      'utf8'
    ).trim();
  } catch {
    return '';
  }
}

const TAVILY_API_KEY = String(
  process.env.TAVILY_API_KEY || readTavilyApiKeyFromFile() || ''
).trim();

const OPENROUTER_API_KEY = String(
  process.env.OPENROUTER_API_KEY || readOpenRouterApiKeyFromFile() || ''
).trim();
const OPENROUTER_MODEL = String(
  process.env.OPENROUTER_MODEL || 'openrouter/free'
).trim();
const aiCooldowns = new Map();
const AI_COOLDOWN_MS = 20000;

function shouldAskAI(text) {
  const value = String(text || '').trim();
  if (value.length < 3 || value.length > 1500) return false;

  // پوښتنې، د بوټ خطاب، او د تازه خبرونو غوښتنې AI ته لېږل کېږي.
  return /[؟?]/u.test(value) ||
    /(^|\\s)(بوټه|بوټ|bot|assistant)(\\s|$)/iu.test(value) ||
    /(څه وخت|څنګه|ولې|څوک|چېرته|چیرته|څومره|معلومات راکړه|تازه معلومات|وروستۍ لوبه|کرکټ|خبرونه|پایله|نتیجه|what|when|where|who|why|how|latest|news|score|cricket|update)/iu.test(value);
}

async function searchWebForQuestion(question) {
  if (!TAVILY_API_KEY) return [];

  try {
    const isNewsQuery = /(خبر|تازه|اوسنی|وروستی|نن|خبرونه|news|latest|today|current|update)/iu.test(question);
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + TAVILY_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: String(question || '').trim().slice(0, 380),
        search_depth: 'basic',
        topic: isNewsQuery ? 'news' : 'general',
        max_results: 5,
        include_answer: true,
        include_raw_content: false
      }),
      signal: AbortSignal.timeout(20000)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.detail || payload?.error || ('HTTP ' + response.status);
      throw new Error(String(detail).slice(0, 200));
    }

    const results = Array.isArray(payload?.results) ? payload.results : [];
    return results
      .filter((item) => {
        try {
          const url = new URL(item?.url);
          return (url.protocol === 'https:' || url.protocol === 'http:') &&
            typeof item?.content === 'string' && item.content.trim();
        } catch {
          return false;
        }
      })
      .slice(0, 5)
      .map((item) => ({
        title: String(item.title || 'سرچینه').slice(0, 180),
        url: String(item.url),
        content: String(item.content || '').slice(0, 1100),
        published_date: item.published_date ? String(item.published_date).slice(0, 40) : ''
      }));
  } catch (err) {
    console.warn('⚠️ د Tavily ویب لټون ناکام شو؛ AI به له موجودو معلوماتو ځواب جوړ کړي:', err?.message || err);
    return [];
  }
}

async function getOpenRouterAnswer(question) {
  if (!OPENROUTER_API_KEY) {
    return '⚠️ د AI خدمت کیلي نه ده تنظیم شوې. په سرور کې openrouter-api-key.txt فایل جوړ او د OpenRouter API key پکې ولیکئ.';
  }

  // Use live web search when a Tavily key is configured.
  const webResults = await searchWebForQuestion(question);
  const sourcesContext = webResults.length
    ? webResults.map((item, index) => [
        '[' + (index + 1) + '] ' + item.title,
        'URL: ' + item.url,
        item.published_date ? 'نېټه: ' + item.published_date : '',
        'موندل شوی متن: ' + item.content
      ].filter(Boolean).join('\n')).join('\n\n')
    : 'د دې پوښتنې لپاره د ویب سرچینې ونه موندل شوې یا Tavily نه دی تنظیم شوی. د سرچینې یا لینک ادعا مه جوړوه؛ که معلومات تازه تایید ته اړتیا لري، په ښکاره یې ووایه.';

  const prompt = [
    'ته د «د معلوماتو نړۍ» د WhatsApp ګروپ مرستیال یې؛ د خبرو اترو او معلوماتي پوښتنو لپاره ګټور، مودب او دقیق کار وکړه.',
    'د ګروپ قوانین تل مراعات کړه: د غړو درناوی، کنځلې او سپکاوی مه کوه، اعلانونه او نامجاز لینکونه مه خپروه، او د جنجال پر ځای ارام ځواب ورکړه.',
    'یوازې د معلوماتي ځواب د مستندولو لپاره د لټون اړوند سرچینې لینکونه ورکړه؛ تبلیغاتي، نامربوط یا جوړ شوي لینکونه مه ورزیاتوه.',
    'د کارونکي په ژبه ځواب ورکړه؛ که ژبه پښتو وي، روانه، طبیعي او روښانه پښتو وکاروه.',
    'د ورکړل شویو ویب سرچینو له متن سره د تازه او تاییدېدونکو حقایقو ځوابونه برابر کړه.',
    'که د سرچینو متن د پوښتنې ځواب نه تاییدوي، معلومات مه جوړوه او ناڅرګندتیا روښانه کړه.',
    'که ویب سرچینې موجودې وي، د اړوندو ادعاوو ترڅنګ [1]، [2] غوندې نښې وکاروه. د سرچینو URL مه بدلوه او جعلي سرچینې مه جوړوه.',
    'که سرچینې کافي نه وي، د عمومي پوهې ځواب ورکولای شې؛ خو تازه یا ناتایید شوي معلومات د یقیني حقیقت په توګه مه وړاندې کوه.',
    'ځواب لنډ، منظم او د WhatsApp لپاره مناسب وساته؛ که پوښتنه ژوره وي، په څو لنډو فقرو کې وضاحت ورکړه.',
    'د کارونکي پوښتنه: ' + question,
    'د ویب لټون پایلې:\n' + sourcesContext
  ].join('\n\n');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://sillydev.co.uk',
      'X-Title': 'Maloomat Bot'
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      reasoning: { effort: 'low' },
      max_tokens: 1400
    }),
    signal: AbortSignal.timeout(30000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = payload?.error?.message || ('HTTP ' + response.status);
    throw new Error('OpenRouter API: ' + apiMessage.slice(0, 250));
  }

  const choice = payload?.choices?.[0];
  const rawContent = choice?.message?.content;
  const answer = typeof rawContent === 'string'
    ? rawContent.trim()
    : Array.isArray(rawContent)
      ? rawContent.map((part) => typeof part?.text === 'string' ? part.text : '').join('').trim()
      : '';

  if (!answer) {
    const details = {
      model: payload?.model || 'unknown',
      finish_reason: choice?.finish_reason || 'unknown',
      completion_tokens: payload?.usage?.completion_tokens ?? null,
      reasoning_tokens: payload?.usage?.completion_tokens_details?.reasoning_tokens ?? null,
    };
    console.error('⚠️ OpenRouter تش ځواب ورکړ؛ معلومات:', JSON.stringify(details));
    throw new Error('OpenRouter returned no visible text (model=' + details.model +
      ', finish_reason=' + details.finish_reason + ').');
  }

  const answerText = answer.slice(0, 3000);
  if (!webResults.length) return answerText;

  const sourceList = webResults.map((item, index) =>
    '[' + (index + 1) + '] ' + item.title + '\n' + item.url
  ).join('\n\n');

  return (answerText + '\n\n🔗 *سرچینې:*\n' + sourceList).slice(0, 3500);
}
// ======================================================
// 1.6 د AI پرته د پښتو معلوماتو ځوابونه
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

function answerFromOfflineKnowledge(question) {
  const normalize = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[؟?!،,.:؛()\[\]{}"'«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const q = normalize(question);
  if (q.length < 3 || !OFFLINE_KNOWLEDGE.length) return null;

  let best = null;
  let bestScore = 0;

  for (const item of OFFLINE_KNOWLEDGE) {
    const terms = [item.title, ...(item.keywords || [])]
      .filter(Boolean)
      .map(normalize)
      .filter((term) => term.length >= 2);

    let score = 0;
    for (const term of terms) {
      if (q.includes(term)) score += term.includes(' ') ? 4 : 2;
    }

    // د ډېرو عامو/کمزورو کلمو پر بنسټ ځواب مه ټاکه.
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (!best || bestScore < 4) return null;

  return '📚 *' + best.title + '*\n\n' + best.answer +
    (best.source ? '\n\n📖 سرچینه: ' + best.source : '') +
    '\n\nℹ️ دا د بوټ له مخکې خوندي شوو معلوماتو څخه ځواب دی؛ AI نه دی کارول شوی.';
}

async function answerWithAI(socket, groupJid, participantJid, question) {
  // لومړی له محلي معلوماتو ځواب پیدا کړه؛ که وموندل شي، AI/API نه کارول کېږي.
  const offlineAnswer = answerFromOfflineKnowledge(question);
  if (offlineAnswer) {
    await safeSend(socket, groupJid, { text: offlineAnswer });
    return true;
  }

  if (!shouldAskAI(question)) return false;

  // د AI پرته حالت: یوازې له GitHub کې خوندي شوي محلي معلوماتو ځواب ورکول.
  await safeSend(socket, groupJid, {
    text: '📚 د دې پوښتنې ځواب لا د بوټ په محلي معلوماتو کې نشته. پوښتنه په بله بڼه ولیکئ یا د معلوماتو مدیر ته یې واستوئ.'
  });
  return true;
}

// ======================================================
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

// په Render کې Environment ته دا متغیر ورزیات کړه:
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
            OPENROUTER_API_KEY
              ? (TAVILY_API_KEY
                  ? '🛡️ یوازې ګروپونه؛ AI او ویب لټون فعال دي (OpenRouter + Tavily).'
                  : '🛡️ یوازې ګروپونه؛ AI فعال دی، خو Tavily ویب لټون نه دی تنظیم شوی.')
              : '🛡️ یوازې ګروپونه؛ AI بند دی (OpenRouter API key نشته).'
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
            // 24. د پوښتنو لپاره AI ځواب
            // ==========================================

            const handledByAI = await answerWithAI(
              socket,
              groupJid,
              participantJid,
              text
            );

            if (handledByAI) {
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
