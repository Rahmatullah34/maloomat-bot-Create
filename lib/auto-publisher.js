'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TIME_ZONE = 'Asia/Kabul';
const CHECK_INTERVAL_MS = 20 * 1000;
const SLOT_GRACE_MINUTES = 10;
const RECENT_CONTENT_LIMIT = 10;
const SLOTS = [
  { hour: 8, minute: 0, key: '08:00' },
  { hour: 13, minute: 0, key: '13:00' },
  { hour: 19, minute: 0, key: '19:00' },
];

// د وړیا او کره خپرولو لپاره لومړنی محتوايي بانک؛ د AI API ته اړتیا نه لري.
const POSTS = [
  { id: 'science-planets', topic: 'علم', title: 'په لمریز نظام کې څو سیارې دي؟', body: 'د اوسني علمي تعریف له مخې په لمریز نظام کې اته سیارې دي: عطارد، زهره، ځمکه، مریخ، مشتري، زحل، اورانوس او نیپټون. پلوټو د کوچنۍ سیارې په ډله کې حسابېږي.', source: 'https://science.nasa.gov/solar-system/planets/' },
  { id: 'science-sunlight', topic: 'علم', title: 'د لمر رڼا ځمکې ته په څو وخت کې رسېږي؟', body: 'د لمر رڼا په اوسط ډول نږدې ۸ دقیقې او ۲۰ ثانیې کې ځمکې ته رسېږي. نو کله چې لمر وینو، په حقیقت کې د هغه رڼا د څو دقیقو پخوانی حالت وینو.', source: 'https://spaceplace.nasa.gov/sun-distance/en/' },
  { id: 'science-mars-day', topic: 'علم', title: 'د مریخ یوه ورځ', body: 'د مریخ یوه ورځ، چې «سول» بلل کېږي، شاوخوا ۲۴ ساعته او ۳۷ دقیقې ده؛ یعنې د ځمکې له ورځې لږ اوږده ده.', source: 'https://science.nasa.gov/mars/facts/' },
  { id: 'science-moon-face', topic: 'علم', title: 'ولې د سپوږمۍ هماغه مخ وینو؟', body: 'سپوږمۍ د خپل محور پر شاوخوا او د ځمکې شاوخوا نږدې په یوه موده کې څرخي. دې حالت ته همغږی دوران ویل کېږي؛ له همدې امله له ځمکې څخه عموماً د سپوږمۍ هماغه مخ وینو.', source: 'https://science.nasa.gov/moon/facts/' },
  { id: 'science-atmosphere', topic: 'علم', title: 'د ځمکې په هوا کې کوم ګاز ډېر دی؟', body: 'د ځمکې د وچې هوا شاوخوا ۷۸ سلنه نایتروجن او ۲۱ سلنه اکسیجن دی. پاتې لږه برخه د ارګون، کاربن ډای اکسایډ او نورو ګازونو څخه جوړه ده.', source: 'https://www.noaa.gov/jetstream/atmosphere/composition-of-atmosphere' },

  { id: 'history-apollo11', topic: 'تاریخ', title: 'د انسان لومړی سپوږمیز سفر', body: 'د اپولو ۱۱ ماموریت په ۱۹۶۹ کال کې د انسانانو لومړنی بریالی سپوږمیز ښکته کېدل ترسره کړل. نېل آرمسټرانګ او بز آلډرین د سپوږمۍ پر سطحه قدم کېښود، او مایکل کولینز په مدار کې پاتې شو.', source: 'https://www.nasa.gov/mission/apollo-11/' },
  { id: 'history-curie', topic: 'تاریخ', title: 'ماري کوري او دوه نوبل جایزې', body: 'ماري کوري د فزیک په برخه کې په ۱۹۰۳ او د کیمیا په برخه کې په ۱۹۱۱ کال کې نوبل جایزه وګټله. د هغې څېړنو د راډیو اکټیفیت د علم په پرمختګ کې مهم رول درلود.', source: 'https://www.nobelprize.org/prizes/chemistry/1911/marie-curie/facts/' },
  { id: 'history-un', topic: 'تاریخ', title: 'ملګري ملتونه کله جوړ شول؟', body: 'د ملګرو ملتونو منشور د ۱۹۴۵ کال د اکتوبر په ۲۴مه نافذ شو؛ له همدې امله دا نېټه د ملګرو ملتونو د رسمي پیل ورځ ګڼل کېږي.', source: 'https://www.un.org/en/about-us/history-of-the-un' },
  { id: 'history-printing', topic: 'تاریخ', title: 'د چاپ ماشین او د کتابونو خپرېدل', body: 'په پنځلسمه پېړۍ کې په اروپا کې د ګوتنبرګ د فلزي خوځنده تورو چاپ د کتابونو د ډېر شمېر په تولید کې مهم بدلون رامنځته کړ. د چاپ ټکنالوژۍ د پوهې او لیکلي متن خپرېدل چټک کړل.', source: 'https://www.britannica.com/technology/printing-press' },

  { id: 'technology-web', topic: 'ټکنالوژي', title: 'د نړۍوال جال (Web) پیل', body: 'ټیم برنرز-لي په ۱۹۸۹ کال کې په CERN کې د نړۍوال جال (World Wide Web) مفکوره وړاندې کړه. وېب‌پاڼې د انټرنېټ له لارې معلوماتو ته د لاسرسي یوه مهمه لاره ده؛ وېب او انټرنېټ یو شی نه دي.', source: 'https://home.cern/science/computing/birth-web' },
  { id: 'technology-internet', topic: 'ټکنالوژي', title: 'انټرنېټ په یوه ورځ نه دی جوړ شوی', body: 'انټرنېټ د څو لسیزو څېړنو او تخنیکي پرمختګونو پایله ده. د بېلابېلو شبکو ترمنځ د معلوماتو د تبادلې ګډ معیارونه د دې لامل شول چې شبکې له یو بل سره وصل شي.', source: 'https://www.internetsociety.org/internet/history-internet/brief-history-internet/' },
  { id: 'technology-solar', topic: 'ټکنالوژي', title: 'لمریز تختې څنګه برېښنا جوړوي؟', body: 'لمریزې برېښنايي تختې د نیمه‌هادي موادو په مرسته د لمر رڼا په برېښنا بدلوي. د تولید اندازه د رڼا، تختې د کیفیت، تودوخې او نصب له شرایطو سره بدلېږي.', source: 'https://www.energy.gov/eere/solar/how-does-solar-work' },
  { id: 'technology-packets', topic: 'ټکنالوژي', title: 'معلومات په انټرنېټ کې څنګه لېږدېږي؟', body: 'د انټرنېټ ډېری معلومات په کوچنیو ټوټو یا «پاکټونو» وېشل کېږي. دا پاکټونه د شبکې له لارې منزل ته رسېږي او په هغه ځای کې بېرته سره یوځای کېږي.', source: 'https://www.internetsociety.org/internet/history-internet/brief-history-internet/' },

  { id: 'health-activity', topic: 'روغتیا', title: 'بدني فعالیت د روغتیا لپاره ګټور دی', body: 'د روغتیا نړیوال سازمان د ډېرو لویانو لپاره په اونۍ کې لږ تر لږه ۱۵۰ دقیقې منځني شدت بدني فعالیت سپارښتنه کوي؛ د هر چا اړتیا د عمر او روغتیايي حالت له مخې بدلېدای شي. د شخصي طبي ستونزې په صورت کې له روغتیايي مسلکي کس سره سلا وکړئ.', source: 'https://www.who.int/news-room/fact-sheets/detail/physical-activity' },
  { id: 'health-antibiotics', topic: 'روغتیا', title: 'انټي‌بیوټیک د هرې ناروغۍ درمل نه دی', body: 'انټي‌بیوټیکونه د باکتریايي عفونتونو پر ضد کار کوي، خو د زکام او انفلونزا په څېر ویروسي ناروغۍ نه درملنه کوي. درمل یوازې د روغتیايي مسلکي کس د لارښوونې له مخې وکاروئ.', source: 'https://www.cdc.gov/antibiotic-use/about/index.html' },
  { id: 'health-sleep', topic: 'روغتیا', title: 'د خوب منظم مهال‌وېش مهم دی', body: 'د ډېرو بالغو کسانو لپاره هره شپه لږ تر لږه ۷ ساعته خوب سپارښتنه کېږي، خو عمر او روغتیايي حالت د خوب اړتیا بدلولای شي. منظم وخت او ارام چاپېریال د ښه خوب په ملاتړ کې مرسته کوي.', source: 'https://www.cdc.gov/sleep/about/index.html' },
  { id: 'health-salt', topic: 'روغتیا', title: 'د مالګې اندازه په پام کې ونیسئ', body: 'د روغتیا نړیوال سازمان د لویانو لپاره په ورځ کې له ۵ ګرامه کمه مالګه سپارښتنه کوي. ډېره مالګه د لوړ فشار له خطر سره تړاو لري؛ د خوړو پر لیبلونو د سوډیم اندازه هم وګورئ.', source: 'https://www.who.int/news-room/fact-sheets/detail/salt-reduction' },
  { id: 'health-handwash', topic: 'روغتیا', title: 'د لاسونو پاکول د عفونتونو مخنیوي کې مرسته کوي', body: 'د صابون او پاکو اوبو په وسیله د لاسونو سم مینځل د میکروبونو د خپرېدو په کمولو کې مرسته کوي، په ځانګړي ډول له تشناب وروسته او د خوړو له چمتو کولو یا خوړلو مخکې.', source: 'https://www.cdc.gov/clean-hands/about/handwashing.html' },

  { id: 'general-earth-ocean', topic: 'عمومي معلومات', title: 'د ځمکې ډېره سطحه اوبه پوښلې ده', body: 'اوبه د ځمکې د سطحې شاوخوا ۷۱ سلنه پوښي، خو ډېره برخه یې مالګینې سمندري اوبه دي. د انسانانو د مستقیم استعمال لپاره د تازه اوبو برخه نسبتاً کمه ده.', source: 'https://oceanservice.noaa.gov/facts/oceanwater.html' },
  { id: 'general-water-cycle', topic: 'عمومي معلومات', title: 'د اوبو طبیعي دوران', body: 'د اوبو په دوران کې اوبه تبخیرېږي، په هوا کې راټولېږي، ورېځې جوړوي او د باران یا واورې په بڼه بېرته ځمکې ته راګرځي. دا دوران د لمر د انرژۍ او جاذبې په مرسته دوام کوي.', source: 'https://www.usgs.gov/special-topics/water-science-school/science/water-cycle' },
];

const TOPIC_ROTATION = {
  '08:00': ['علم', 'تاریخ', 'ټکنالوژي', 'روغتیا', 'عمومي معلومات'],
  '13:00': ['تاریخ', 'ټکنالوژي', 'روغتیا', 'عمومي معلومات', 'علم'],
  '19:00': ['ټکنالوژي', 'روغتیا', 'عمومي معلومات', 'علم', 'تاریخ'],
};

const CONFIG_PATH = path.resolve(process.cwd(), 'auto-publisher-config.json');
const ALLOWED_GROUPS = String(process.env.ALLOWED_GROUPS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const STATE_PATH = path.resolve(
  String(process.env.AUTO_POST_STATE_PATH || path.join(process.cwd(), 'data', 'auto-publisher-state.json')).trim()
);

let timer = null;
let ticking = false;
let lastTickAt = null;
let lastResult = 'not-started';

function getRuntimeConfig() {
  let fileConfig = {};
  let configError = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('تنظیماتي فایل باید JSON object وي.');
    }
    fileConfig = parsed;
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      configError = String(error && error.message ? error.message : error).slice(0, 300);
    }
  }

  const envEnabled = String(process.env.AUTO_POST_ENABLED || '').trim();
  const envGroupJid = String(process.env.AUTO_POST_GROUP_JID || '').trim();
  const envChannelJid = String(process.env.AUTO_POST_CHANNEL_JID || '').trim();
  const derivedGroup = !envGroupJid && ALLOWED_GROUPS.length === 1 ? ALLOWED_GROUPS[0] : '';

  return {
    enabled: envEnabled
      ? /^(1|true|yes|on)$/i.test(envEnabled)
      : fileConfig.enabled === true,
    groupJid: envGroupJid || String(fileConfig.groupJid || '').trim() || derivedGroup,
    channelJid: envChannelJid || String(fileConfig.channelJid || '').trim(),
    configError,
  };
}

function getKabulTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    dateKey: values.year + '-' + values.month + '-' + values.day,
  };
}

function getDueSlot(date = new Date(), graceMinutes = SLOT_GRACE_MINUTES) {
  const local = getKabulTimeParts(date);
  const minuteOfDay = local.hour * 60 + local.minute;
  const slot = SLOTS.find((item) => {
    const delta = minuteOfDay - (item.hour * 60 + item.minute);
    return delta >= 0 && delta < graceMinutes;
  });
  if (!slot) return null;
  return {
    ...slot,
    dateKey: local.dateKey,
    slotId: local.dateKey + '@' + slot.key,
    topic: getTopicForSlot(local.dateKey, slot.key),
  };
}

function getTopicForSlot(dateKey, slotKey) {
  const dayIndex = Math.floor(Date.parse(dateKey + 'T00:00:00Z') / 86400000);
  const topics = TOPIC_ROTATION[slotKey] || TOPIC_ROTATION['08:00'];
  return topics[((dayIndex % topics.length) + topics.length) % topics.length];
}

function isValidGroupJid(value) {
  return /^[0-9-]+@g\.us$/.test(String(value || '').trim());
}

function isValidChannelJid(value) {
  return /^[0-9]+@newsletter$/.test(String(value || '').trim());
}

function formatPost(post, slot) {
  return [
    '📚 *Maloomat AI | معلومات AI*',
    '📌 *' + post.title + '*',
    '',
    post.body,
    '',
    '🏷️ موضوع: ' + post.topic,
    '🔎 سرچینه: ' + post.source,
    '⏰ د افغانستان وخت: ' + slot.key,
    '🌟 معلومات زده کړه، پوهه خپره کړه!',
  ].join('\n');
}

function defaultState() {
  return { version: 1, slots: {}, recentContentIds: [], contentCursor: 0 };
}

function loadState() {
  let raw;
  try {
    raw = fs.readFileSync(STATE_PATH, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return defaultState();
    throw error;
  }
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.version !== 1 || typeof parsed.slots !== 'object' || !Array.isArray(parsed.recentContentIds)) {
    throw new Error('د اتومات خپرولو د حالت فایل جوړښت ناسم دی.');
  }
  return parsed;
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  const temporaryPath = STATE_PATH + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, STATE_PATH);
}

function pruneState(state, today) {
  const minimumDate = Date.parse(today + 'T00:00:00Z') - (30 * 86400000);
  for (const key of Object.keys(state.slots)) {
    const recordDate = String(key).slice(0, 10);
    const timestamp = Date.parse(recordDate + 'T00:00:00Z');
    if (Number.isFinite(timestamp) && timestamp < minimumDate) delete state.slots[key];
  }
  state.recentContentIds = state.recentContentIds.slice(-RECENT_CONTENT_LIMIT);
  return state;
}

function selectNextPost(state, topic) {
  const matching = POSTS.filter((post) => post.topic === topic);
  if (!matching.length) throw new Error('د موضوع لپاره معلومات نه شته: ' + topic);
  const recent = new Set(state.recentContentIds);
  const candidates = matching.filter((post) => !recent.has(post.id));
  const pool = candidates.length ? candidates : matching;
  const post = pool[state.contentCursor % pool.length];
  state.contentCursor = (state.contentCursor + 1) % POSTS.length;
  state.recentContentIds.push(post.id);
  state.recentContentIds = state.recentContentIds.slice(-RECENT_CONTENT_LIMIT);
  return post;
}

function getTargets(config = getRuntimeConfig()) {
  const targets = [];
  if (isValidGroupJid(config.groupJid)) {
    if (ALLOWED_GROUPS.length > 0 && !ALLOWED_GROUPS.includes(config.groupJid)) {
      // که د ګروپ allowlist تنظیم وي، له هغې بهر مه خپروه.
    } else {
      targets.push({ type: 'group', jid: config.groupJid });
    }
  }
  if (isValidChannelJid(config.channelJid)) {
    targets.push({ type: 'channel', jid: config.channelJid });
  }
  return targets;
}

async function sendToTarget(socket, target, text) {
  if (target.type === 'group') {
    if (typeof socket.sendMessage !== 'function') throw new Error('د WhatsApp د پیغام لېږلو طریقه نه شته.');
    return socket.sendMessage(target.jid, { text });
  }
  const sendNewsletter = socket.newsletterSendMessage || socket.sendNewsletterMessage;
  if (typeof sendNewsletter !== 'function') {
    throw new Error('د نصب شوې Baileys نسخې د چینل د خپرولو طریقه نه ده تایید شوې.');
  }
  return sendNewsletter.call(socket, target.jid, { text });
}

function getAutoPublisherStatus() {
  const config = getRuntimeConfig();
  const targets = getTargets(config);
  return {
    enabled: config.enabled,
    timeZone: TIME_ZONE,
    schedule: SLOTS.map((slot) => slot.key),
    targetCount: targets.length,
    groupConfigured: targets.some((target) => target.type === 'group'),
    channelConfigured: targets.some((target) => target.type === 'channel'),
    configFileAvailable: fs.existsSync(CONFIG_PATH) && !config.configError,
    configError: config.configError,
    running: Boolean(timer),
    lastTickAt,
    lastResult,
  };
}

async function tick(getSocket, now = new Date()) {
  const config = getRuntimeConfig();
  if (config.configError) {
    lastResult = 'config-read-error';
    console.error('❌ د اتومات خپرولو تنظیماتي فایل ستونزه لري:', config.configError);
    return;
  }
  if (!config.enabled) {
    lastResult = 'disabled-by-config';
    return;
  }
  const targets = getTargets(config);
  if (!targets.length) {
    lastResult = 'waiting-for-valid-target-jid';
    return;
  }
  const slot = getDueSlot(now);
  if (!slot) {
    lastResult = 'waiting-for-next-slot';
    return;
  }

  let state;
  try {
    state = pruneState(loadState(), slot.dateKey);
  } catch (error) {
    lastResult = 'state-read-error';
    console.error('❌ د اتومات پوسټونو د حالت لوستل ناکام شول:', error.message);
    return;
  }

  let record = state.slots[slot.slotId];
  if (!record) {
    const post = selectNextPost(state, slot.topic);
    record = {
      slotId: slot.slotId,
      topic: post.topic,
      contentId: post.id,
      title: post.title,
      createdAt: new Date().toISOString(),
      targets: {},
    };
    for (const target of targets) {
      record.targets[target.jid] = { type: target.type, status: 'pending', attempts: 0 };
    }
    state.slots[slot.slotId] = record;
    try {
      saveState(state);
    } catch (error) {
      lastResult = 'state-write-error';
      console.error('❌ د اتومات پوسټونو د حالت خوندي کول ناکام شول؛ پیغام نه لېږل کېږي:', error.message);
      return;
    }
  } else {
    for (const target of targets) {
      if (!record.targets[target.jid]) record.targets[target.jid] = { type: target.type, status: 'pending', attempts: 0 };
    }
  }

  const socket = getSocket();
  if (!socket || socketConnectionClosed(socket)) {
    lastResult = 'waiting-for-whatsapp-connection';
    return;
  }

  const post = POSTS.find((item) => item.id === record.contentId);
  if (!post) {
    lastResult = 'content-record-not-found';
    console.error('❌ د اتومات پوسټ ثبت شوې محتوا نه موندل کېږي:', record.contentId);
    return;
  }
  const message = formatPost(post, slot);
  let attempted = false;

  for (const target of targets) {
    const targetState = record.targets[target.jid];
    if (!targetState || targetState.status === 'sent' || targetState.status === 'failed' || targetState.status === 'uncertain') continue;
    if (targetState.status === 'sending') {
      targetState.status = 'uncertain';
      targetState.note = 'سرور د لېږلو پر مهال بیاچالان شوی؛ د دوه ځله خپرولو د مخنیوي لپاره اتومات بیا لېږل نه کېږي.';
      try { saveState(state); } catch (error) {
        console.error('❌ د نامعلوم لېږلو حالت خوندي نه شو:', error.message);
      }
      continue;
    }

    targetState.status = 'sending';
    targetState.attempts = Number(targetState.attempts || 0) + 1;
    targetState.startedAt = new Date().toISOString();
    try {
      saveState(state);
    } catch (error) {
      lastResult = 'state-write-error';
      console.error('❌ د لېږلو تر مخه حالت نه شو خوندي کېدای؛ پیغام نه لېږل کېږي:', error.message);
      continue;
    }

    attempted = true;
    try {
      const response = await sendToTarget(socket, target, message);
      targetState.status = 'sent';
      targetState.sentAt = new Date().toISOString();
      if (response && response.key && response.key.id) targetState.messageId = response.key.id;
      delete targetState.error;
      saveState(state);
      console.log('✅ اتومات پوسټ خپور شو:', slot.slotId, target.type, target.jid, post.id);
    } catch (error) {
      targetState.status = 'failed';
      targetState.failedAt = new Date().toISOString();
      targetState.error = String(error && error.message ? error.message : error).slice(0, 300);
      try { saveState(state); } catch (saveError) {
        console.error('❌ د ناکام لېږلو حالت خوندي نه شو:', saveError.message);
      }
      console.error('❌ د اتومات پوسټ لېږل ناکام شول:', slot.slotId, target.type, target.jid, targetState.error);
    }
  }

  const statuses = Object.values(record.targets).map((item) => item.status);
  if (statuses.length && statuses.every((status) => status === 'sent')) lastResult = 'sent';
  else if (attempted) lastResult = 'attempted-with-errors-or-pending-targets';
  else lastResult = 'slot-already-processed-or-uncertain';
}

function socketConnectionClosed(socket) {
  // د Baileys socket په ټولو نسخو کې د اتصال عامه بولین property نشته.
  // د ناستې د حقیقي حالت سرچینه د index.js callback ده؛ که socket موجود وي، لېږل هڅه کېدای شي.
  return !socket;
}

function startAutoPublisher(getSocket) {
  if (timer) return getAutoPublisherStatus();
  if (typeof getSocket !== 'function') throw new TypeError('getSocket باید یوه function وي.');
  const initialConfig = getRuntimeConfig();
  lastResult = initialConfig.enabled ? 'scheduler-started' : 'disabled-by-config';

  const runTick = async () => {
    if (ticking) return;
    ticking = true;
    lastTickAt = new Date().toISOString();
    try {
      await tick(getSocket, new Date());
    } catch (error) {
      lastResult = 'unexpected-error';
      console.error('❌ د اتومات خپرولو ناڅاپي ستونزه:', error && error.stack ? error.stack : error);
    } finally {
      ticking = false;
    }
  };

  // د حالت لاګ یوازې وروسته چاپېږي چې مهال‌وېش ټایمر جوړ شوی وي.
  timer = setInterval(runTick, CHECK_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  runTick().catch(() => {});
  console.log('🗓️ د اتومات معلوماتي خپرولو مهالوېش:', JSON.stringify(getAutoPublisherStatus()));
  return getAutoPublisherStatus();
}

module.exports = {
  CONTENT_COUNT: POSTS.length,
  formatPost,
  getAutoPublisherStatus,
  getDueSlot,
  getKabulTimeParts,
  getTopicForSlot,
  isValidChannelJid,
  isValidGroupJid,
  selectNextPost,
  startAutoPublisher,
  tick,
};
