'use strict';

const { getResearchQueryHints } = require('./answer-plan');
const { isTafsirYaseerAuthorshipQuestion } = require('./book-source-policy');
const { isQuranRukuCountQuestion } = require('./religious-source-policy');

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
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_match, code) => {
      const number = /^x/i.test(code) ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      return Number.isFinite(number) && number >= 0 && number <= 0x10ffff
        ? String.fromCodePoint(number)
        : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWebResultUrl(rawUrl) {
  try {
    let url = new URL(rawUrl, 'https://html.duckduckgo.com');
    if (
      (url.hostname === 'duckduckgo.com' || url.hostname.endsWith('.duckduckgo.com')) &&
      (url.pathname === '/l/' || url.pathname === '/l')
    ) {
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
  const source = String(html || '');
  const results = [];
  const anchors = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const snippets = [];
  const snippetPattern = /<(?:td|div)[^>]*class=["'][^"']*(?:result-snippet|result__snippet|result__body)[^"']*["'][^>]*>([\s\S]*?)<\/(?:td|div)>/gi;
  let match;

  while ((match = snippetPattern.exec(source)) !== null) {
    snippets.push(decodeWebText(match[1]));
  }

  while ((match = anchors.exec(source)) !== null && results.length < 8) {
    const attributes = match[1];
    const inner = match[2];
    const className = (attributes.match(/\bclass=["']([^"']*)["']/i) || [])[1] || '';
    const hasKnownResultClass = /(?:result-link|result__a|result-title-a|result__url|result__title|result-link-a)/i.test(className);
    const hasResultTestId = /\bdata-testid=["']result-title-a["']/i.test(attributes);
    const hasHeading = /<h[1-3]\b/i.test(inner);

    // DuckDuckGo has changed its result-link markup more than once.
    // Only accept known result anchors, explicit result test IDs, or heading links.
    if (!hasKnownResultClass && !hasResultTestId && !hasHeading) continue;

    const rawUrl = (attributes.match(/\bhref=["']([^"']+)["']/i) || [])[1] || '';
    const url = normalizeWebResultUrl(rawUrl);
    const title = decodeWebText(inner);
    if (!url || !title) continue;

    let hostname = '';
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (hostname === 'duckduckgo.com' || hostname.endsWith('.duckduckgo.com')) continue;
    if (results.some((item) => item.url === url)) continue;

    results.push({
      title: title.slice(0, 180),
      url,
      snippet: (snippets[results.length] || '').slice(0, 700),
      provider: 'DuckDuckGo',
    });
  }
  return results;
}

function getSearchPageHint(html) {
  const source = String(html || '').toLowerCase();
  if (/captcha|anomaly-modal|verify you are human|unusual traffic|automated requests|challenge-platform/.test(source)) {
    return 'د سرچ انجن د تایید/اتومات غوښتنو مخنیوي پاڼه ښکاري؛ دا محدودیت نه بای‌پس کېږي.';
  }
  if (/no results|no results found|no results for/.test(source)) {
    return 'د سرچ انجن پاڼه د صفر پایلو نښه لري.';
  }
  if (/result__a|result-link|result-title-a|data-testid=["']result-title-a/.test(source)) {
    return 'د پایلو نښې په HTML کې شته، خو parser یې لینکونه نه دي استخراج کړي؛ د markup بدلون محتمل دی.';
  }
  return 'HTML ترلاسه شوی، خو د پایلو پېژندل شوی جوړښت پکې ونه موندل شو.';
}

function extractSearchTopic(question) {
  let topic = String(question || '').trim();
  topic = topic.split(/(?:په اړه|په هکله|په باب|معلومات راټول|معلومات راکړ|مفصل تشریح|تشریح کړه|لینکونه هم|سرچینې هم|ولټوه|لټون وکړه|search online|search the web|give me detailed|collect information)/iu)[0];
  topic = topic.replace(/[،,:;.!؟?]+$/u, '').trim();
  return topic.length >= 2 ? topic.slice(0, 180) : String(question || '').trim().slice(0, 180);
}

function isFacebookMonetizationQuestion(question) {
  const value = String(question || '').normalize('NFKC');
  const hasFacebook = /(?:facebook|meta|فیسبوک|فېسبوک|فیس\s*بوک|دفیسبوک)/iu.test(value);
  const hasMonetization = /(?:monetiz|مون[یېي]?ټ?ایز|مونټایز|عاید|پیس[ېي]\s*ګټل)/iu.test(value);
  return hasFacebook && hasMonetization;
}

function isAhmadShahQuestion(question) {
  const value = String(question || '').normalize('NFKC');
  return /(?:احمد\s*شاه|احمدشاه|ahmad\s+shah|ahmed\s+shah|durrani|dorrani|abdali)/iu.test(value);
}

function buildSearchQueries(question) {
  const raw = String(question || '').trim();
  if (!raw) return [];

  const topic = extractSearchTopic(raw);

  // Search the specific counting convention and its scholarly differences;
  // avoid generic Quran encyclopedia pages for a Ruku-count question.
  if (isQuranRukuCountQuestion(raw)) {
    return [
      'Quran ruku count 540 558 differences scholarly study',
      'Quran Foundation API list of all rukus count 558',
      'مصطلح الركوع في المصاحف 540 558 اختلاف عدد الركوعات',
    ];
  }

  // د احمدشاه بابا لپاره لنډې او دقیقې انګلیسي جملې د اوږدو پوښتنو په پرتله
  // د Wikipedia API لپاره ښه لټون جوړوي؛ DDG که challenge وښيي، بای‌پس نه کېږي.
  if (isAhmadShahQuestion(raw)) {
    const asksBattles = /(?:جګړ|لښکرکښ|پوځي|battle|campaign|war|military)/iu.test(raw);
    return asksBattles
      ? [
          'Ahmad Shah Durrani major military campaigns and battles',
          'Third Battle of Panipat 1761 Ahmad Shah Durrani',
          'Ahmad Shah Durrani campaigns Punjab Maratha Sikh',
        ]
      : [
          'Ahmad Shah Durrani biography',
          'Ahmad Shah Durrani Durrani Empire 1747',
          'Ahmad Shah Abdali history',
        ];
  }

  let translated = raw
    .replace(/د(?=(?:فیسبوک|فېسبوک|فیس\s*بوک))/giu, 'د ')
    .replace(/(?:دفیسبوک|فیسبوک|فېسبوک|فیس\s*بوک)/giu, 'Facebook')
    .replace(/(?:مونټایزیشن|مونټایزېشن|مونیتایزیشن|منیټایزیشن|مونټایز|منټایزیشن)/giu, 'monetization')
    .replace(/(?:بشپړ|مکمل|پوره)/gu, 'complete')
    .replace(/(?:طریقه|لارښوونه|لارښود)/gu, 'guide')
    .replace(/(?:معلوماتو?|راکړه|راکړئ|کړه)/gu, ' ')
    .replace(/[،,:;.!؟?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (isFacebookMonetizationQuestion(raw)) {
    translated = 'Facebook Content Monetization eligibility how to apply step by step official Meta';
  }

  const seen = new Set();
  const queries = [];
  const isFacebookQuestion = isFacebookMonetizationQuestion(raw);
  const hints = getResearchQueryHints(raw);
  const candidates = isFacebookQuestion
    ? [topic, translated]
    : [topic, ...hints, raw, translated];

  for (const candidate of candidates) {
    const value = String(candidate || '').replace(/\s+/g, ' ').trim();
    const key = value.toLowerCase();
    if (value.length < 2 || seen.has(key)) continue;
    seen.add(key);
    queries.push(value);
    if (queries.length >= 3) break;
  }
  return queries;
}

function getCuratedFallbackSources(question) {
  if (isQuranRukuCountQuestion(question)) {
    return [
      {
        title: 'List Rukus — Quran Foundation Content API',
        url: 'https://api-docs.quran.foundation/docs/content_apis_versioned/4.0.0/list-rukus/',
        snippet: 'The Quran Foundation Content API documents a numbering convention whose ruku_number values run from 1 through 558. This is the count used by this API data set; ruku divisions can differ between printed mushaf traditions.',
        provider: 'Curated Quran ruku reference — Quran Foundation',
      },
      {
        title: 'مصطلح الركوع في المصاحف: مدلوله، نشأته، وأقوال العلماء فيه',
        url: 'https://search.mandumah.com/Record/771156',
        snippet: 'A peer-reviewed research article published in 2016 in the Journal of Tebyān for Quranic Studies, associated with Imam Muhammad ibn Saud Islamic University and the Saudi Scientific Society for Quran and its Sciences. Its abstract describes differing divisions: 540 rukus in one scheme and 558, the count commonly found in current mushafs; it also discusses a distinct 480-maqra division.',
        provider: 'Curated Quran ruku reference — peer-reviewed study',
      },
    ];
  }

  if (isFacebookMonetizationQuestion(question)) {
    return [{
      title: 'Facebook Content Monetization — د Meta رسمي معلومات',
      url: 'https://about.fb.com/news/2026/03/creator-fast-track-grow-your-audience-earn-money-on-facebook/',
      snippet: 'د Meta د ۲۰۲۶ کال د مارچ د رسمي معلوماتو له مخې، Facebook Content Monetization د بلنې پر بنسټ پروګرام دی. علاقه‌مندان کولای شي په Facebook موبایل اپ کې Professional Dashboard > Monetization > Content Monetization ته ولاړ شي او د علاقې فورمه ډکه کړي؛ دا فورمه د بلنې یا عاید ضمانت نه کوي. د شرایطو وړ Reels، Stories، عکسونه او متن پوسټونه د محتوا د فعالیت له مخې عاید ترلاسه کولای شي. د خپل حساب د وروستي وضعیت لپاره همدا رسمي لارښود او د اپ Monetization برخه وګورئ.',
      provider: 'Meta Official fallback',
      publishedAt: '2026-03',
    }];
  }

  if (isTafsirYaseerAuthorshipQuestion(question)) {
    return [{
      title: 'تفسير یسیر مشهوره په فوق الیسیر — پښتو کتابتون',
      url: 'https://pashtonlegacylibrarykandahar.com/books1/3974',
      snippet: 'د پښتو کتابتون د کتابونو کتالوګ د «تفسير یسیر مشهوره په فوق الیسیر» تر سرلیک لاندې دا پښتو تفسیر ثبت کړی او د لیکوال په برخه کې «مولوي مراد علي» لیکي. د بېنوا یوې تاریخي مقالې هم د تفسیر یسیر نوم د مولوي مراد علي کاموي سره یاد کړی؛ خو د دې کتالوګ په ثبت کې د نوم اوږده بڼه په خپله نه ده لیکل شوې.',
      provider: 'Curated bibliographic reference — Pashto Library',
    }];
  }

  if (!isAhmadShahQuestion(question)) return [];

  // دا له مخکې ټاکل شوې عامه تاریخي سرچینې دي؛ کله چې لټون کوونکي بند وي،
  // د نامربوطې پایلې پر ځای د موضوع اړوند حوالې برابروي.
  return [
    {
      title: 'Afghanistan x. Political History — Encyclopaedia Iranica',
      url: 'https://www.iranicaonline.org/articles/afghanistan-x-political-history/',
      snippet: 'د Encyclopaedia Iranica علمي تاریخي کتنه وايي چې احمدشاه په ۱۷۴۷م کال د پښتنو د مشرانو د جرګې له خوا پاچا وټاکل شو او په کندهار کې تاج‌پوشي شو. د هغه د واکمنۍ پر مهال دراني قلمرو پراخ شو؛ مقاله د ۱۷۵۷م کال د ډهلي نیول، د ۱۷۶۱م کال د پاني پت بریا او په پنجاب کې د سیکانو د ځواک زیاتېدل هم یادوي. دا عمومي سیاسي تاریخ دی، نه د هرې جګړې بشپړ نظامي راپور.',
      provider: 'Curated historical reference — Encyclopaedia Iranica',
    },
    {
      title: 'Ahmad Shah (1724–1773) — 1911 Encyclopaedia Britannica',
      url: 'https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Ahmad_Shah',
      snippet: 'د ۱۹۱۱م کال Encyclopaedia Britannica تاریخي مدخل د احمدشاه د دراني واکمنۍ د بنسټ، د پنجاب او کشمیر د پراختیا، د ۱۷۵۶م کال د ډهلي لښکرکښۍ، د مرهټو له ځواک سره د ټکر او د ۱۷۶۱م کال د پاني پت جګړې یادونه کوي. دا پخوانۍ حوالوي سرچینه ده؛ نېټې او جزئیات باید له نورو تاریخي سرچینو سره پرتله شي.',
      provider: 'Curated historical reference — 1911 Encyclopaedia Britannica',
    },
    {
      title: 'Ahmad Shah Durrani: Founder of the Durrani Empire — Islamic Heritage Encyclopaedia',
      url: 'https://know-your-history.com/articles/ahmad-shah-durrani/',
      snippet: 'دا مفصله ثانوي تاریخي مقاله د ۱۷۴۸م کال د منوپور جګړې، د ۱۷۵۶–۱۷۵۷م کلونو د ډهلي کمپاین، د ۱۴ جنوري ۱۷۶۱م د پاني پت درېیمې جګړې، او په ۱۷۶۰مو کلونو کې د پنجاب او سیکانو پر ضد د کمپاینونو په اړه بحث کوي. مقاله یادونه کوي چې د زېږېدو او مړینې د ځینو جزئیاتو په اړه سرچینې یو شان نه دي؛ له علمي حوالو سره یې پرتله کول مناسب دي.',
      provider: 'Curated historical reference — Islamic Heritage Encyclopaedia',
    },
  ];
}

module.exports = {
  buildSearchQueries,
  getCuratedFallbackSources,
  isAhmadShahQuestion,
  getSearchPageHint,
  isFacebookMonetizationQuestion,
  isQuranRukuCountQuestion,
  parseDuckDuckGoResults,
};
