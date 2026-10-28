'use strict';

const { isTafsirYaseerAuthorshipQuestion } = require('./book-source-policy');

const DETAIL_PATTERN = /(?:تفصیل|تفصیلي|تفصيل(?:ي| سره)?|مفصل|مکمل|بشپړ|پوره|هر اړخیز|په تفصیل|په بشپړ ډول|ټولې مشهورې|ټول مهم|قدم په قدم|ګام په ګام|مرحله په مرحله|مکمله طریقه|مکمل معلومات|تفصیلي ځواب|comprehensive|in detail|detailed answer|full guide|complete guide|step by step|all major|famous battles)/iu;

const CATEGORY_RULES = [
  { category: 'translation', pattern: /(?:ژباړه|ترجمه|ژباړل|translate|translation|translate this)/iu },
  { category: 'health', pattern: /(?:روغتیا|روغتيا|ناروغ|ناروغي|درمل|دوا|نښې نښانې|تشخیص|درملنه|طبي|ډاکټر|صحت|health|medical|medicine|symptom|treatment|diagnos)/iu },
  { category: 'religion', pattern: /(?:اسلام|اسلامي|مسلمان|قرآن|قران|حدیث|حديث|فقه|لمونځ|لمانځ|نماز|روژه|زکات|شرعي|حلال|حرام|دیني|دین|مذهب|قیامت|قيامت|اخرت|آخرت|الله|رسول|نبي|پیغمبر|پيغمبر|سنت|تفسیر|تفسير|دعا|عبادت|فتوا|عقیده|عقيده|مسیحیت|مسیحی|عیسی|يهود|یهود|تورات|انجیل|بودا|بودیزم|هندو|هندویزم|سیک|سیکیزم|جینیزم|جین|زرتشتی|زرادشت|شینتو|تاویزم|کلیسا|کنیسه|مسجد|معبد|religion|religious|quran|hadith|islam|muslim|fiqh|prayer|salah|bible|christianity|christian|judaism|jewish|torah|gospel|buddhism|buddhist|hinduism|sikhism|sikh|jainism|zoroastrian|shinto|taoism|confucianism|atheism|atheist|agnostic|theology|prophet|allah|jesus|moses|sharia|fatwa|church|synagogue|mosque|deity|religious studies)/iu },
  { category: 'history', pattern: /(?:تاریخ|تاريخ|تاریخي|تاريخي|احمدشاه|احمد شاه|بابا|پاچا|واکمن|سلطان|امپراتوري|امپراتورۍ|جګړه|جګړې|لښکرکښ|فتح|تخت|سلطنت|dynasty|history|historic|historical|ahmad shah|ahmed shah|durrani|battle|battles|campaign|war|wars|emperor|king|ruler)/iu },
  { category: 'current', pattern: /(?:تازه خبر|وروستي خبرونه|اوسني خبرونه|نن|اوسمهال|اوسنی|اوسنۍ|تازه معلومات|بیه|قیمت|نرخ|د هوا|نننۍ پېښه|latest|current|today|breaking|news|weather|price|exchange rate|recent update)/iu },
  { category: 'how_to', pattern: /(?:څنګه|طریقه|لارښوونه|لارښود|مراحل|ګامونه|مرحلې|نصب|جوړول|فعالول|تنظیمول|اکاونټ جوړ|حساب جوړ|حل لاره|څنګه وکړم|how to|step by step|tutorial|guide|install|setup|configure|troubleshoot)/iu },
  { category: 'technology', pattern: /(?:ټکنالوژي|تکنالوژي|موبایل|کمپیوټر|کمپیوټري|اپلیکیشن|کاریال|وېبپاڼه|سافټویر|پروګرام|انټرنېټ|انټرنټ|فېسبوک|فیسبوک|واټس اپ|واټساپ|whatsapp|facebook|software|computer|mobile|technology|app|website|programming|code|internet)/iu },
  { category: 'science', pattern: /(?:ساینس|علمي|فزیک|کیمیا|بیولوژي|DNA|لمریز نظام|سیاره|جاذبه|برېښنا|ځمکه|فضا|ساینسي|science|scientific|physics|chemistry|biology|solar system|planet|gravity|electricity|space)/iu },
];

const CATEGORY_INSTRUCTIONS = {
  translation: 'د ژباړې په پوښتنه کې د اصلي متن معنا، نومونه، شمېرې او لحن وساته. ژباړه له خپلې اضافي تشریح څخه جلا کړه؛ که کارونکي یوازې ژباړه غوښتې وي، بې‌اړخه معلومات مه ورزیاتوه.',
  health: 'روغتیايي پوښتنه په عمومي تعلیمي ډول ځواب کړه؛ تشخیص قطعي مه اعلانوه، د درملو اندازه مه اټکلوه، د بیړنیو نښو په صورت کې د عاجلې طبي مرستې سپارښتنه وکړه او معتبرې روغتیايي سرچینې ته لومړیتوب ورکړه.',
  religion: 'د دیني پوښتنې اصلي مطلب ته مستقیم، عادي او ګټور ځواب ورکړه؛ هره دیني پوښتنه د سرچینې د نشتوالي له امله مه بندوه. د عامو عباداتو، اصطلاحاتو او پېژندل شوو معلوماتو په اړه له خپلې عمومي پوهې ځواب ورکولای شې؛ که آنلاین سرچینه موندل کېږي، د عمومي شالید لپاره باوري علمي/انسایکلویډیايي سرچینه هم کارولای شې. که د فقهي مذهبونو ترمنځ اختلاف وي، په لنډه توګه یې یاد کړه. د دقیق آیت یا حدیث لفظ، شمېره، سند/درجه، د فتوا مشخصه حواله او ځانګړې شرعي پرېکړه مه جوړوه؛ که پوښتنه په څرګنده کره حواله غواړي یا په موضوع کې د نظر اختلاف مهم وي، دا محدودیت روښانه کړه او د تایید شوې سرچینې تر نشتوالي پورې دقیق نقل مه منسوبه کوه. د انسایکلویډیا له لنډیز څخه ځانګړې فتوا مه استنباطوه او جعلي کتاب، اقتباس یا لینک مه جوړوه.',
  history: 'تاریخي ځواب له پېژندنې او شالید څخه پیل کړه. کره نېټې، ځایونه، نومونه، د پېښو ترتیب او تاریخي اهمیت بیان کړه. که د جګړو پوښتنه وي، د هرې جګړې نوم، نېټه، ځای، مقابل لوری، پایله او اهمیت په جلا سرلیک یا جدول کې ولیکه؛ پوځي کمپاین او یوه ټاکلې جګړه سره مه ګډوه. اختلاف لرونکي تاریخي روایتونه په ښکاره جلا کړه.',
  current: 'د تازه یا بدلېدونکو معلوماتو لپاره د سرچینې نېټه او د پېښې نېټه جلا بیان کړه. که سرچینې تازه نه وي یا لټون ناکام شوی وي، پخواني معلومات د اوسني حقیقت په توګه مه وړاندې کوه.',
  how_to: 'عملي لارښود په شمېرل شوو ګامونو ولیکه. د پیل شرطونه، هر ګام، د بریالیتوب د تایید لاره او د عامو ستونزو حل بیان کړه. د کارونکي د وسیلې یا اپلیکیشن اړوند ګامونه مه اټکلوه که یې ملاتړ نه وي.',
  technology: 'تخنیکي ځواب په عملي او روښانه ژبه ولیکه. د مېنو نومونه او کمانډونه دقیق وښیه، د خطا د تشخیص او حل ګامونه جلا کړه، او د حساب، رمز یا API کلید په څېر رازونه مه غواړه.',
  science: 'علمي ځواب کې لومړی تعریف، بیا د کار کولو څرنګوالی، اړوند مثال او مهم محدودیتونه تشریح کړه. ثابت علمي معلومات له فرضیې او ناڅرګندتیا څخه جلا وساته.',
  general: 'عمومي پوښتنه په مستقیم ځواب پیل کړه، بیا د اړتیا مطابق شالید، مهم جزئیات او مثالونه وړاندې کړه. نامعلومې ادعاوې یا جوړې شوې سرچینې مه ورزیاتوه.',
};

const CATEGORY_LABELS = {
  translation: 'ژباړه', health: 'روغتیا', religion: 'دین', history: 'تاریخ',
  current: 'تازه معلومات', how_to: 'عملي لارښود', technology: 'ټکنالوژي',
  science: 'ساینس', general: 'عمومي معلومات',
};

function normalizeIntentText(question) {
  return String(question || '').normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .trim();
}

function isDetailedQuestion(question) {
  return DETAIL_PATTERN.test(normalizeIntentText(question));
}

function classifyQuestion(question) {
  const value = normalizeIntentText(question);
  const translationRule = CATEGORY_RULES.find(rule => rule.category === 'translation');
  if (translationRule && translationRule.pattern.test(value)) return 'translation';

  // Classify by the user's main task first. A passing mention of faith or a
  // religious word must not override a clear health, history, science, or tech intent.
  for (const rule of CATEGORY_RULES) {
    if (rule.category === 'translation' || rule.category === 'religion') continue;
    if (rule.pattern.test(value)) return rule.category;
  }

  const religionRule = CATEGORY_RULES.find(rule => rule.category === 'religion');
  if (religionRule && religionRule.pattern.test(value)) return 'religion';
  return 'general';
}

function buildAnswerPlan(question) {
  const value = normalizeIntentText(question);
  const category = classifyQuestion(value);
  const detailed = isDetailedQuestion(value);
  const historyBattleQuestion = category === 'history' &&
    /(?:جګړ|لښکرکښ|پوځي|battle|campaign|war|military)/iu.test(value);

  const sectionsByCategory = {
    history: historyBattleQuestion
      ? ['لنډه پېژندنه او تاریخي شالید', 'د مهمو جګړو یا لښکرکښیو لېست', 'د هرې پېښې نېټه، ځای، مقابل لوری او پایله', 'تاریخي اهمیت او د سرچینو اختلاف']
      : ['لنډه پېژندنه', 'تاریخي شالید او مهمې پېښې', 'اغېزې او اهمیت', 'د سرچینو اختلاف او پایله'],
    how_to: ['اړین شرطونه', 'شمېرل شوي عملي ګامونه', 'د بریالیتوب د تایید لاره', 'د عامو ستونزو حل'],
    health: ['عمومي تشریح', 'نښې یا لاملونه که اړوند وي', 'خوندي ګامونه او محدودیتونه', 'کله مسلکي مرسته وغوښتل شي'],
    religion: ['مستقیم ځواب', 'اصلي دلیل یا معتبر روایت', 'د نظرونو توپیر که موجود وي', 'لنډه پایله'],
    science: ['تعریف', 'څنګه کار کوي', 'مثال یا عملي تشریح', 'محدودیتونه او سرچینې'],
    current: ['د اوسني حالت لنډیز', 'د پېښې/معلوماتو نېټه', 'رسمي یا معتبرې سرچینې', 'هغه څه چې لا تایید شوي نه دي'],
    translation: ['ژباړه', 'یوازې که غوښتل شوې وي، د مهمو اصطلاحاتو لنډ وضاحت'],
    technology: ['مستقیم حل یا تشریح', 'اړین شرطونه', 'عملي ګامونه', 'تصدیق او د ستونزو حل'],
    general: ['مستقیم ځواب', 'مهم شالید', 'مثال یا اړوند جزئیات', 'لنډه پایله'],
  };

  const expectedSections = sectionsByCategory[category] || sectionsByCategory.general;
  const detailInstruction = detailed
    ? 'کارونکي څرګند تفصیل غوښتې دی: ځواب دې بشپړ، منظم او په څو اړوندو برخو کې وي. مهم اړخونه مه پرېږده، خو تکرار مه کوه؛ که موضوع پراخه وي، د لوستلو وړ سرلیکونه او شمېرل شوي ټکي وکاروه.'
    : 'د پوښتنې د اندازې مطابق ځواب ورکړه. ساده پوښتنه بې‌ځایه مه اوږدوه؛ خو که د ځواب د فهم لپاره اړین شالید وي، لنډ یې بیان کړه.';

  const instructions = [
    'د پوښتنې ډول: ' + (CATEGORY_LABELS[category] || CATEGORY_LABELS.general) + '.',
    detailInstruction,
    CATEGORY_INSTRUCTIONS[category] || CATEGORY_INSTRUCTIONS.general,
    'د ځواب وړاندیز شوی جوړښت: ' + expectedSections.join('؛ ') + '.',
    'که حقیقي ویب پایلې ورکړل شوې وي، د هغوی له شواهدو زیاتې سرچینه‌محورې ادعاوې مه کوه. که ویب پایلې نه وي، د ثابتو عمومي معلوماتو لپاره له باوري عمومي پوهې یا د بوټ له تایید شوې داخلي زېرمې ځواب ورکولای شې. د سرچینو د نشتوالي تخنیکي تبصره د اصلي ځواب پر ځای مه لیکه؛ که د دقیق حدیث، قانوني مادې یا ځانګړي نقل کره حواله نه لرې، اټکل یې مه کوه او محدودیت په ساده ژبه روښانه کړه. جعلي لینک، جعلي اقتباس یا جعلي نېټه مه جوړوه.',
    'د ځانګړي کتاب/اثر د لیکوال، ناشر، چاپ کال یا د یوه مشخص شخص د نسبت په اړه یوازې هغه وخت قطعي نوم بیان کړه چې اړونده سرچینه هماغه اثر او نوم په څرګنده یاد کړي؛ د موضوع عمومي پاڼه د لیکوال ثبوت نه دی. که داسې سرچینه نه وي، نوم مه اټکلوه او ووایه چې لا تایید شوی نه دی.',
    'د WhatsApp لپاره ځواب د لنډو پاراګرافونو، روښانه سرلیکونو او محدودو ایموجیو په کارولو لوستل‌وړ وساته؛ د ځواب منځپانګه د پرې کېدو لپاره مه لنډوه.',
  ].join('\n');

  return { category, categoryLabel: CATEGORY_LABELS[category] || CATEGORY_LABELS.general, detailed, historyBattleQuestion, expectedSections, instructions };
}

function getReligiousResearchQueryHints(question) {
  const value = normalizeIntentText(question);
  const detailedSourceRequest = /(?:کتاب|کتابونو|حواله|سرچینه|روایت|معتبر|تفصیل|مفصل|hadith|source|reference|book|citation)/iu.test(value);

  // A named work and authorship request needs a book-specific search, not generic Quran pages.
  if (isTafsirYaseerAuthorshipQuestion(value)) {
    return [
      'Tafseer Yaseer Pashto author Maulvi Murad Ali Kamawi Sahibzada',
      'تفسیر یسیر مولوي مراد علي کاموي',
    ];
  }

  // Questions about why humans were created need topic-specific English terms;
  // a raw Pashto sentence often returns no useful result on English reference sites.
  if (/(?:الله|خدای|رب|allah|god|creator)/iu.test(value) &&
      /(?:انسان|بشر|مخلوق|اشرف|پیدا|پيدا|خلق|human|mankind|creation|created)/iu.test(value)) {
    return [
      'Why did Allah create human beings in Islam Quran purpose of human creation',
      'Quran tafsir purpose of human creation worship Allah 51:56',
    ];
  }

  if (/(?:قیامت|قيامت|اخرت|آخرت|اشراط الساعة|day of judgment|day of judgement|signs of the hour|end times)/iu.test(value) &&
      /(?:نښ|علامت|sign|قیامت|قيامت|اخرت|آخرت|کتاب|hadith|روایت)/iu.test(value)) {
    return [
      'minor signs of the Hour in Islam hadith scholarly sources',
      'signs of the Day of Judgment Islam hadith reliable references',
    ];
  }

  if (/(?:پنځه\s*(?:بناوې|رکنونه)|five pillars|بناوې د اسلام|رکنونه اسلام)/iu.test(value)) {
    return [
      'Five Pillars of Islam Quran hadith reliable reference',
      'Five Pillars of Islam Britannica overview',
    ];
  }

  if (/(?:ږیر|ګیره|ږيره|beard|beards|facial hair|shaving beard)/iu.test(value)) {
    return [
      'Islamic ruling on keeping or shaving the beard recognized scholars',
      'Sahih al-Bukhari Sahih Muslim leave beards trim moustaches hadith',
    ];
  }

  if (/(?:لمونځ|لمانځه|نماز|سلات|salah|salat|prayer in islam)/iu.test(value)) {
    return [
      'Salah Islamic prayer obligations Quran hadith reliable sources',
      'Islamic prayer scholarly explanation conditions and pillars',
    ];
  }

  if (/(?:روژه|روژې|رمضان|صوم|fasting|ramadan)/iu.test(value)) {
    return [
      'Ramadan fasting in Islam Quran hadith reliable sources',
      'Islamic fasting rules recognized scholarly source',
    ];
  }

  if (/(?:زکات|زکاة|zakah|zakat)/iu.test(value)) {
    return [
      'Zakat in Islam Quran hadith reliable sources',
      'Zakat rules nisab recognized Islamic scholarly source',
    ];
  }

  if (/(?:حج|حاجي|hajj|umrah|عمره)/iu.test(value)) {
    return [
      'Hajj and Umrah in Islam Quran hadith reliable sources',
      'Pillars of Hajj recognized Islamic scholarly source',
    ];
  }

  if (/(?:وضو|اودس|wudu|ablution|غسل|ghusl|تیمم|tayammum)/iu.test(value)) {
    return [
      'wudu ablution in Islam Quran hadith reliable sources',
      'Islamic ritual purification recognized scholarly explanation',
    ];
  }

  if (/(?:رسول الله|پیغمبر|پيغمبر|محمد ﷺ|محمد\s*صلى الله|سیرت|سنت نبوي|prophet muhammad|seerah|sirah)/iu.test(value)) {
    return [
      'Prophet Muhammad seerah biography reliable Islamic historical sources',
      'Prophet Muhammad sayings teachings Sunnah reliable source',
    ];
  }

  if (/(?:قرآن|قران|تفسیر|تفسير|quran|qur\x27an|tafsir|quranic)/iu.test(value)) {
    return [
      'Quran verses translation tafsir reliable Islamic sources',
      'Quran content and commentary recognized reference',
    ];
  }

  if (/(?:حدیث|حديث|hadith|سنت|sunnah|روایت|روايت)/iu.test(value)) {
    return [
      'hadith in Islam original text reference grading reliable source',
      'Sunnah hadith collections scholarly reference',
    ];
  }

  if (/(?:فتوا|حلال|حرام|شرعي حکم|حکم|سود|ربا|طلاق|نکاح|وراثت|میراث|کفاره|نصاب|حلال|حرام|fatwa|halal|haram|fiqh|islamic ruling|riba|inheritance|divorce)/iu.test(value)) {
    const concepts = value
      .replace(/(?:د|په|له|او|یا|چې|څه|کوم|کومه|څنګه|ولې|ایا|مفصل|تفصیل|راکړه|راکړئ|معلومات|کتابونو|سرچینې|حوالې|حواله|وایه|تشریح|کړه|دي|ده|دی|لري|دیني|اسلامي|اسلام|؟|\?)/giu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
    return [
      'Islamic fiqh fatwa recognized scholars ' + concepts,
      'Islamic ruling Quran Sunnah scholarly source ' + concepts,
    ];
  }

  if (/(?:اسلام|اسلامي|مسلمان|دین|مذهب|faith|religion|islam|muslim)/iu.test(value)) {
    return [
      'Islam beliefs worship practices reliable reference',
      'Islam overview Britannica academic reference',
    ];
  }

  if (detailedSourceRequest) {
    return [
      'Islamic religious teaching scholarly sources Quran Sunnah',
      'Islamic studies reliable reference',
    ];
  }

  return [];
}

function getResearchQueryHints(question) {
  const value = normalizeIntentText(question);
  const asksBattles = /(?:جګړ|لښکرکښ|پوځي|battle|campaign|war|military)/iu.test(value);
  if (/(?:احمدشاه|احمد\s*شاه|احمد شاه بابا|ahmad shah|ahmed shah|durrani)/iu.test(value)) {
    if (asksBattles) {
      return [
        'Ahmad Shah Durrani major military campaigns and famous battles scholarly historical sources',
        'Ahmad Shah Durrani Third Battle of Panipat 1761 campaigns dates outcomes reliable sources',
      ];
    }
    return ['Ahmad Shah Durrani biography Durrani Empire historical sources'];
  }

  if (classifyQuestion(value) === 'religion') {
    const religiousHints = getReligiousResearchQueryHints(value);
    if (religiousHints.length) return religiousHints.slice(0, 2);
  }

  const translated = value
    .replace(/(?:احمدشاه بابا|احمد شاه بابا|احمدشاه|احمد شاه)/giu, 'Ahmad Shah Durrani')
    .replace(/(?:جګړې|جګړه)/giu, 'battles')
    .replace(/(?:مشهورې|مشهور|مهمې|مهم)/giu, 'famous')
    .replace(/(?:تاریخي|تاریخ)/giu, 'historical')
    .replace(/(?:لښکرکښۍ|لښکرکښي|لښکرکښ)/giu, 'military campaigns')
    .replace(/(?:مکمل|بشپړ|تفصیلي|تفصيلي|مفصل)/giu, 'detailed')
    .replace(/(?:لارښوونه|لارښود|طریقه)/giu, 'guide')
    .replace(/(?:روغتیا|روغتيا)/giu, 'health')
    .replace(/(?:ساینس|علمي)/giu, 'science')
    .replace(/(?:فیسبوک|فېسبوک|دفیسبوک)/giu, 'Facebook')
    .replace(/(?:مونټایزیشن|مونټایزېشن|مونټایز|منیټایزیشن)/giu, 'monetization')
    .replace(/[؟?!،,:;]+/g, ' ').replace(/\s+/g, ' ').trim();

  const hints = [];
  if (translated && translated !== value) hints.push(translated);
  if (/(?:تاریخ|تاریخي|جګړ|لښکرکښ)/iu.test(value)) hints.push((translated || value) + ' credible historical sources chronology');
  return [...new Set(hints.filter(Boolean))].slice(0, 2);
}

module.exports = { buildAnswerPlan, classifyQuestion, getResearchQueryHints, isDetailedQuestion };
