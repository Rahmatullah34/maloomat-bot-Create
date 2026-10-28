'use strict';

const DETAIL_PATTERN = /(?:تفصیل|تفصیلي|تفصيل(?:ي| سره)?|مفصل|مکمل|بشپړ|پوره|هر اړخیز|په تفصیل|په بشپړ ډول|ټولې مشهورې|ټول مهم|قدم په قدم|ګام په ګام|مرحله په مرحله|مکمله طریقه|مکمل معلومات|تفصیلي ځواب|comprehensive|in detail|detailed answer|full guide|complete guide|step by step|all major|famous battles)/iu;

const CATEGORY_RULES = [
  { category: 'translation', pattern: /(?:ژباړه|ترجمه|ژباړل|translate|translation|translate this)/iu },
  { category: 'health', pattern: /(?:روغتیا|روغتيا|ناروغ|ناروغي|درمل|دوا|نښې نښانې|تشخیص|درملنه|طبي|ډاکټر|صحت|health|medical|medicine|symptom|treatment|diagnos)/iu },
  { category: 'religion', pattern: /(?:اسلام|مسلمان|قرآن|قران|حدیث|حديث|فقه|لمونځ|لمانځ|نماز|روژه|زکات|شرعي|حلال|حرام|دیني|religion|religious|quran|hadith|islam|fiqh|prayer|salah)/iu },
  { category: 'history', pattern: /(?:تاریخ|تاريخ|تاریخي|تاريخي|احمدشاه|احمد شاه|بابا|پاچا|واکمن|سلطان|امپراتوري|امپراتورۍ|جګړه|جګړې|لښکرکښ|فتح|تخت|سلطنت|dynasty|historic|historical|ahmad shah|ahmed shah|durrani|battle|battles|campaign|war|wars|emperor|king|ruler)/iu },
  { category: 'current', pattern: /(?:تازه خبر|وروستي خبرونه|اوسني خبرونه|نن|اوسمهال|اوسنی|اوسنۍ|تازه معلومات|بیه|قیمت|نرخ|د هوا|نننۍ پېښه|latest|current|today|breaking|news|weather|price|exchange rate|recent update)/iu },
  { category: 'how_to', pattern: /(?:څنګه|طریقه|لارښوونه|لارښود|مراحل|ګامونه|مرحلې|نصب|جوړول|فعالول|تنظیمول|اکاونټ جوړ|حساب جوړ|حل لاره|څنګه وکړم|how to|step by step|tutorial|guide|install|setup|configure|troubleshoot)/iu },
  { category: 'technology', pattern: /(?:ټکنالوژي|تکنالوژي|موبایل|کمپیوټر|کمپیوټري|اپلیکیشن|کاریال|وېبپاڼه|سافټویر|پروګرام|انټرنېټ|انټرنټ|فېسبوک|فیسبوک|واټس اپ|واټساپ|whatsapp|facebook|software|computer|mobile|technology|app|website|programming|code|internet)/iu },
  { category: 'science', pattern: /(?:ساینس|علمي|فزیک|کیمیا|بیولوژي|DNA|لمریز نظام|سیاره|جاذبه|برېښنا|ځمکه|فضا|ساینسي|science|scientific|physics|chemistry|biology|solar system|planet|gravity|electricity|space)/iu },
];

const CATEGORY_INSTRUCTIONS = {
  translation: 'د ژباړې په پوښتنه کې د اصلي متن معنا، نومونه، شمېرې او لحن وساته. ژباړه له خپلې اضافي تشریح څخه جلا کړه؛ که کارونکي یوازې ژباړه غوښتې وي، بې‌اړخه معلومات مه ورزیاتوه.',
  health: 'روغتیايي پوښتنه په عمومي تعلیمي ډول ځواب کړه؛ تشخیص قطعي مه اعلانوه، د درملو اندازه مه اټکلوه، د بیړنیو نښو په صورت کې د عاجلې طبي مرستې سپارښتنه وکړه او معتبرې روغتیايي سرچینې ته لومړیتوب ورکړه.',
  religion: 'د دیني موضوع په ځواب کې د قرآن، حدیث، فقهې نظر او تاریخي روایت ترمنځ توپیر وساته. د آیت یا حدیث عبارت، شمېره یا درجه مه جوړوه که سرچینه یې نه تاییدوي؛ که د مذهبونو نظرونه توپیر لري، اختلاف بیان کړه.',
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
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(value)) return rule.category;
  }
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
    'سرچینې یوازې د ورکړل شوو واقعي پایلو څخه وکاروه. د سرچینې تر اقتباس زیات محتوا مه ادعا کوه؛ که ادعا نه تاییدېږي، ناڅرګندتیا روښانه کړه. جعلي لینک، جعلي اقتباس یا جعلي نېټه مه جوړوه.',
    'د WhatsApp لپاره ځواب د لنډو پاراګرافونو، روښانه سرلیکونو او محدودو ایموجیو په کارولو لوستل‌وړ وساته؛ د ځواب منځپانګه د پرې کېدو لپاره مه لنډوه.',
  ].join('\n');

  return { category, categoryLabel: CATEGORY_LABELS[category] || CATEGORY_LABELS.general, detailed, historyBattleQuestion, expectedSections, instructions };
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
