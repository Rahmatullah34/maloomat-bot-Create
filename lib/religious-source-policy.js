'use strict';

// Trusted first-party texts, established religious publishing sources, and major references.
// A domain match is not a guarantee that every claim is correct; answers must still
// be supported by the retrieved excerpt and note meaningful interpretive differences.
const TRUSTED_RELIGIOUS_DOMAINS = Object.freeze([
  // Islam: primary texts and established scholarly/reference publishers.
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
  // Christianity and the Bible.
  'biblegateway.com',
  'bible.com',
  'vatican.va',
  'usccb.org',
  // Judaism.
  'sefaria.org',
  'chabad.org',
  'myjewishlearning.com',
  // Buddhism and Hindu primary-text collections.
  'suttacentral.net',
  'accesstoinsight.org',
  'gitasupersite.iitk.ac.in',
  'vedicheritage.gov.in',
  // Academic/reference publishers useful for comparative religion and history of religion.
  'britannica.com',
  'oxfordreference.com',
  'oxfordacademic.com',
  'cambridge.org',
  'jstor.org',
  'plato.stanford.edu',
]);

function getSourceHostname(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''));
    if (url.protocol !== 'https:') return '';
    return url.hostname.toLowerCase().replace(/\.$/u, '');
  } catch {
    return '';
  }
}

function isTrustedReligiousDomain(rawUrl) {
  const hostname = getSourceHostname(rawUrl);
  if (!hostname) return false;
  return TRUSTED_RELIGIOUS_DOMAINS.some(domain =>
    hostname === domain || hostname === 'www.' + domain
  );
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

function isTrustedReligiousSource(result) {
  return Boolean(
    result &&
    isTrustedReligiousDomain(result.url) &&
    String(result.title || '').trim().length >= 3 &&
    hasUsableSourceExcerpt(result)
  );
}

function hasTrustedReligiousReferenceText(text) {
  const urls = String(text || '').match(/https?:\\/\\/[^\\s<>()]+/giu) || [];
  return urls.some(isTrustedReligiousDomain);
}

function filterTrustedReligiousSources(results) {
  if (!Array.isArray(results)) return [];
  return results.filter(isTrustedReligiousSource);
}

module.exports = {
  TRUSTED_RELIGIOUS_DOMAINS,
  getSourceHostname,
  isTrustedReligiousDomain,
  isTrustedReligiousSource,
  hasTrustedReligiousReferenceText,
  filterTrustedReligiousSources,
};
