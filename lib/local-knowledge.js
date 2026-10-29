'use strict';

const { normalizePashto } = require('./moderation');
const { isCryptoEducationQuestion } = require('./crypto-question');
const { isTimeSensitiveQuestion } = require('./research-engine');

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

module.exports = {
  OFFLINE_KNOWLEDGE,
  rememberGroupMember,
  answerIdentityQuestion,
  answerFromOfflineKnowledge,
  answerSimpleMathQuestion,
  answerCommonPashtoQuestion,
  isSensitiveSafetyRequest,
};
