'use strict';

const { getResearchQueryHints } = require('./answer-plan');

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

function buildSearchQueries(question) {
  const raw = String(question || '').trim();
  if (!raw) return [];

  const topic = extractSearchTopic(raw);
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
  if (!isFacebookMonetizationQuestion(question)) return [];
  return [{
    title: 'Facebook Content Monetization — د Meta رسمي معلومات',
    url: 'https://about.fb.com/news/2026/03/creator-fast-track-grow-your-audience-earn-money-on-facebook/',
    snippet: 'د Meta د ۲۰۲۶ کال د مارچ د رسمي معلوماتو له مخې، Facebook Content Monetization د بلنې پر بنسټ پروګرام دی. علاقه‌مندان کولای شي په Facebook موبایل اپ کې Professional Dashboard > Monetization > Content Monetization ته ولاړ شي او د علاقې فورمه ډکه کړي؛ دا فورمه د بلنې یا عاید ضمانت نه کوي. د شرایطو وړ Reels، Stories، عکسونه او متن پوسټونه د محتوا د فعالیت له مخې عاید ترلاسه کولای شي. د خپل حساب د وروستي وضعیت لپاره همدا رسمي لارښود او د اپ Monetization برخه وګورئ.',
    provider: 'Meta Official fallback',
    publishedAt: '2026-03',
  }];
}

module.exports = {
  buildSearchQueries,
  getCuratedFallbackSources,
  getSearchPageHint,
  isFacebookMonetizationQuestion,
  parseDuckDuckGoResults,
};
