'use strict';

// Historical, political, and scientific explanations must be grounded in
// relevant sources from institutions with an identifiable editorial or research process.
const POLITICAL_TOPIC_PATTERN = /(?:سیاس|سیاست|حکومت|دولت|انتخابات|ټاکنې|پارلمان|ولسمشر|فکري\s*جګړه|تبلیغات|کمونیزم|پانګوال|ایدیالوژ|ایډیالوژ|دیموکراس|جمهوریت|politic|government|election|parliament|president|ideolog|propaganda|disinformation|information warfare|ideological warfare|capitalism|communism|(?:public|foreign|government|political)\s+policy|political campaign)/iu;

const TRUSTED_FACTUAL_DOMAINS = Object.freeze([
  'britannica.com',
  'oxfordreference.com',
  'oxfordacademic.com',
  'oup.com',
  'cambridge.org',
  'jstor.org',
  'history.com',
  'worldhistory.org',
  'archives.gov',
  'loc.gov',
  'nationalarchives.gov.uk',
  'un.org',
  'unesco.org',
  'who.int',
  'nasa.gov',
  'noaa.gov',
  'nih.gov',
  'cdc.gov',
  'nsf.gov',
  'nationalacademies.org',
  'nature.com',
  'science.org',
  'pnas.org',
  'cell.com',
  'sciencedirect.com',
  'springer.com',
  'wiley.com',
  'tandfonline.com',
  'pubmed.ncbi.nlm.nih.gov',
  'pmc.ncbi.nlm.nih.gov',
  'ourworldindata.org',
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'bbc.co.uk',
  'dw.com',
  'rferl.org',
  'voanews.com',
  'tolonews.com',
  'pajhwok.com',
  'afghanistan-analysts.org',
  'afghanistaninternational.com',
  'npr.org',
  'pbs.org',
  'aljazeera.com',
  'theguardian.com',
  'ft.com',
  'nytimes.com',
  'washingtonpost.com',
  'hrw.org',
  'amnesty.org',
  'ohchr.org',
  'worldbank.org',
  'imf.org',
  'oecd.org',
]);

const TRUSTED_INSTITUTIONAL_SUFFIXES = Object.freeze([
  '.gov',
  '.edu',
  '.mil',
  '.int',
  '.ac.uk',
  '.edu.au',
  '.gov.uk',
  '.gov.au',
  '.gov.af',
  '.edu.af',
  '.gov.in',
  '.gov.pk',
  '.gov.nz',
  '.gc.ca',
  '.gov.sg',
  '.go.jp',
  '.ac.jp',
  '.edu.cn',
  '.gov.ng',
  '.edu.ng',
]);

function normalizeHostname(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.hostname.toLowerCase().replace(/^www\./u, '');
  } catch {
    return '';
  }
}

function hostMatchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith('.' + domain);
}

function requiresFactualSourceEvidence(question, category = '') {
  const normalizedCategory = String(category || '').trim().toLowerCase();
  if (normalizedCategory === 'history' || normalizedCategory === 'science') return true;
  return POLITICAL_TOPIC_PATTERN.test(String(question || '').normalize('NFKC'));
}

function isTrustedFactualSource(source) {
  const hostname = normalizeHostname(source && source.url);
  if (!hostname) return false;

  // General Wikipedia pages may be useful starting points, but are not enough
  // as the sole authority for these source-required answers.
  if (hostMatchesDomain(hostname, 'wikipedia.org')) return false;

  if (TRUSTED_INSTITUTIONAL_SUFFIXES.some(suffix => hostname.endsWith(suffix))) return true;
  return TRUSTED_FACTUAL_DOMAINS.some(domain => hostMatchesDomain(hostname, domain));
}

function filterAuthoritativeFactualSources(results, question, category = '') {
  const safeResults = Array.isArray(results) ? results.filter(Boolean) : [];
  if (!requiresFactualSourceEvidence(question, category)) return safeResults;
  return safeResults.filter(isTrustedFactualSource);
}

module.exports = {
  requiresFactualSourceEvidence,
  isTrustedFactualSource,
  filterAuthoritativeFactualSources,
};
