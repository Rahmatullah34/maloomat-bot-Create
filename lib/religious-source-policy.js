'use strict';

// Primary Islamic texts and established scholarly answers are eligible even for
// specific doctrine, hadith, or jurisprudence questions. General encyclopedias
// are only a fallback for explanatory/background questions, never a fatwa source.
const AUTHORITATIVE_RELIGIOUS_DOMAINS = Object.freeze([
  'quran.com',
  'sunnah.com',
  'dorar.net',
  'islamweb.net',
  'islamqa.info',
  'alifta.gov.sa',
  'binbaz.org.sa',
  'quran.ksu.edu.sa',
  'altafsir.com',
  'shamela.ws',
  'islamhouse.com',
  'islamreligion.com',
  'biblegateway.com',
  'bible.com',
  'vatican.va',
  'usccb.org',
  'sefaria.org',
  'chabad.org',
  'myjewishlearning.com',
  'suttacentral.net',
  'accesstoinsight.org',
  'gitasupersite.iitk.ac.in',
  'vedicheritage.gov.in',
]);

const SECONDARY_RELIGIOUS_REFERENCE_DOMAINS = Object.freeze([
  'en.wikipedia.org',
  'ps.wikipedia.org',
  'ar.wikipedia.org',
  'ur.wikipedia.org',
  'fa.wikipedia.org',
  'simple.wikipedia.org',
  'britannica.com',
  'oxfordreference.com',
  'oxfordacademic.com',
  'cambridge.org',
  'jstor.org',
  'plato.stanford.edu',
  'pashtonlegacylibrarykandahar.com',
]);

// Exact sacred-text quotations, hadith grading/references, fatwas, and practical
// rulings need a primary text or a recognized scholarly/legal answer—not Wikipedia.
const SPECIFIC_RELIGIOUS_CLAIM_PATTERN = /(?:(?:حدیث|حديث|hadith).{0,35}(?:سند|صحیح|صحيح|ضعیف|ضعيف|حسن|شمېره|حواله|درجه|صحت|متن|reference|number|grading|authenticity|chain)|(?:سند|صحیح|صحيح|ضعیف|ضعيف|حسن|شمېره|حواله|درجه|صحت|متن|reference|number|grading|authenticity|chain).{0,35}(?:حدیث|حديث|hadith)|(?:آیت|آیه|آيه|verse).{0,35}(?:شمېره|حواله|سوره|سورة|متن|نص|number|reference|text|quran|قرآن)|(?:قرآن|quran).{0,35}(?:آیت|آیه|آيه|verse|شمېره|حواله|نص|text)|فتوا|fatwa|شرعي حکم|حکم یې څه|حلال|حرام|halal|haram|سود|ربا|riba|طلاق|islamic divorce|وراثت|میراث|inheritance|نصاب|کفاره|نماز.{0,18}(?:حکم|صحیح)|روژه.{0,18}(?:مات|حکم|کفاره)|legal ruling|islamic ruling|specific jurisprudential ruling)/iu;
function getSourceHostname(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''));
    if (url.protocol !== 'https:') return '';
    return url.hostname.toLowerCase().replace(/\.$/u, '');
  } catch {
    return '';
  }
}

function hostnameIsInList(hostname, domains) {
  return domains.some(domain => hostname === domain || hostname === 'www.' + domain);
}

function isAuthoritativeReligiousDomain(rawUrl) {
  return hostnameIsInList(getSourceHostname(rawUrl), AUTHORITATIVE_RELIGIOUS_DOMAINS);
}

function isSecondaryReligiousReferenceDomain(rawUrl) {
  return hostnameIsInList(getSourceHostname(rawUrl), SECONDARY_RELIGIOUS_REFERENCE_DOMAINS);
}

function isTrustedReligiousDomain(rawUrl) {
  return isAuthoritativeReligiousDomain(rawUrl) || isSecondaryReligiousReferenceDomain(rawUrl);
}

function requiresAuthoritativeReligiousSource(question) {
  return SPECIFIC_RELIGIOUS_CLAIM_PATTERN.test(String(question || ''));
}

// If the user explicitly requests book references or source links, do not replace
// missing evidence with an uncited model answer.
function asksForReligiousReferences(question) {
  const value = String(question || '').normalize('NFKC');
  return /(?:د\s*(?:معتبر[و]?|باوري)?\s*کتابونو?\s*(?:له\s*)?حوال[ېهوا]|له\s*کتابونو?\s*حوال[ېهوا]\s*سره|حوال[ېهوا]\s*(?:راکړه|راکړئ|هم|لینک|شمېره|number|link)|سرچین[ېه]\s*(?:راکړه|راکړئ|هم|لینک|وښایه|وښیه)|(?:give|provide|include|with).{0,25}(?:sources?|references?|citations?|book references?))/iu.test(value);
}

function hasUsableSourceExcerpt(result) {
  if (!result || typeof result !== 'object') return false;
  const evidence = [
    result.snippet,
    result.description,
    result.extract,
    result.excerpt,
    result.text,
  ].map(value => String(value || '').trim()).filter(Boolean).join(' ');
  return evidence.replace(/\s+/gu, ' ').length >= 40;
}

function isTrustedReligiousSource(result, question = '') {
  if (
    !result ||
    !isTrustedReligiousDomain(result.url) ||
    String(result.title || '').trim().length < 3 ||
    !hasUsableSourceExcerpt(result)
  ) return false;

  if (isAuthoritativeReligiousDomain(result.url)) return true;
  return !requiresAuthoritativeReligiousSource(question);
}

function hasTrustedReligiousReferenceText(text, question = '') {
  const urls = String(text || '').match(/https?:\/\/[^\s<>()]+/giu) || [];
  return urls.some(url => {
    if (isAuthoritativeReligiousDomain(url)) return true;
    return isSecondaryReligiousReferenceDomain(url) &&
      !requiresAuthoritativeReligiousSource(question);
  });
}

function filterTrustedReligiousSources(results, question = '') {
  if (!Array.isArray(results)) return [];
  return results.filter(item => isTrustedReligiousSource(item, question));
}

module.exports = {
  AUTHORITATIVE_RELIGIOUS_DOMAINS,
  SECONDARY_RELIGIOUS_REFERENCE_DOMAINS,
  getSourceHostname,
  isAuthoritativeReligiousDomain,
  isSecondaryReligiousReferenceDomain,
  isTrustedReligiousDomain,
  requiresAuthoritativeReligiousSource,
  asksForReligiousReferences,
  isTrustedReligiousSource,
  hasTrustedReligiousReferenceText,
  filterTrustedReligiousSources,
};
