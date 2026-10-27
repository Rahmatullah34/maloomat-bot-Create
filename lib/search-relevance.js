'use strict';

const STOP_WORDS = new Set([
  'د', 'په', 'له', 'او', 'یا', 'چې', 'دا', 'هغه', 'دی', 'ده', 'دي', 'دې',
  'څه', 'شی', 'څوک', 'څنګه', 'ولې', 'کوم', 'کومه', 'کومې', 'کومو', 'کوي',
  'و', 'وه', 'یې', 'هم', 'لري', 'شي', 'شوی', 'شوې', 'کې', 'ته', 'زما',
  'ستا', 'دوی', 'دغه', 'داسې', 'یوه', 'یو', 'دئ', 'ایا', 'آیا', 'له',
  'اړه', 'معلومات', 'راکړه', 'تشریح', 'کړه', 'کوم', 'کوم دي', 'څو دي',
  'the', 'a', 'an', 'and', 'or', 'is', 'are', 'was', 'were', 'what', 'who',
  'how', 'why', 'when', 'where', 'which', 'of', 'to', 'in', 'on', 'for',
  'about', 'me', 'tell', 'explain', 'please', 'current', 'latest',
]);

// Generic words are weak evidence of relevance; the subject itself must match.
const GENERIC_TERMS = new Set([
  'انسان', 'بدن', 'دنده', 'human', 'humans', 'person', 'people', 'body', 'anatomy',
  'function', 'functions', 'role', 'purpose', 'duty', 'job',
]);

// A small bilingual vocabulary helps Pashto questions match English source titles.
const TERM_ALIASES = {
  'زړه': ['زړه', 'heart', 'cardiac', 'cardiovascular', 'circulatory'],
  'انسان': ['انسان', 'human', 'humans', 'person', 'people'],
  'بدن': ['بدن', 'body', 'anatomy'],
  'دنده': ['دنده', 'function', 'functions', 'role', 'purpose', 'duty', 'job'],
  'افغانستان': ['افغانستان', 'afghanistan'],
  'کابل': ['کابل', 'kabul'],
  'انټرنېټ': ['انټرنېټ', 'انټرنټ', 'internet', 'online', 'connectivity', 'outage', 'shutdown'],
  'انټرنټ': ['انټرنېټ', 'انټرنټ', 'internet', 'online', 'connectivity', 'outage', 'shutdown'],
  'خبر': ['خبر', 'خبرونه', 'news', 'headlines', 'update'],
  'خبرونه': ['خبر', 'خبرونه', 'news', 'headlines', 'updates'],
  'لمونځ': ['لمونځ', 'لمانځه', 'نماز', 'prayer', 'salah', 'salat', 'namaz'],
  'لمانځه': ['لمونځ', 'لمانځه', 'نماز', 'prayer', 'salah', 'salat', 'namaz'],
  'فرضونه': ['فرضونه', 'فرض', 'obligations', 'obligation', 'required'],
  'فرض': ['فرضونه', 'فرض', 'obligations', 'obligation', 'required'],
  'حنفي': ['حنفي', 'حنفی', 'hanafi'],
  'حنفی': ['حنفي', 'حنفی', 'hanafi'],
  'فقه': ['فقه', 'فقهې', 'فقهي', 'jurisprudence', 'fiqh'],
  'فقهې': ['فقه', 'فقهې', 'فقهي', 'jurisprudence', 'fiqh'],
};

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getQuestionTerms(question) {
  return [...new Set(
    normalizeSearchText(question)
      .split(' ')
      .filter(term => term.length >= 2 && !STOP_WORDS.has(term))
  )];
}

function aliasesFor(term) {
  const aliases = TERM_ALIASES[term] || [term];
  return [...new Set(aliases.map(normalizeSearchText).filter(Boolean))];
}

function aliasAppears(text, tokenSet, alias) {
  if (alias.includes(' ')) {
    return (' ' + text + ' ').includes(' ' + alias + ' ');
  }
  return tokenSet.has(alias);
}

function countMatchedConcepts(terms, value) {
  const text = normalizeSearchText(value);
  if (!text) return 0;
  const tokenSet = new Set(text.split(' '));
  let matches = 0;

  for (const term of terms) {
    if (aliasesFor(term).some(alias => aliasAppears(text, tokenSet, alias))) {
      matches += 1;
    }
  }
  return matches;
}

/**
 * Filters and ranks search results against the user's question.
 * A result should match the specific subject in its title. Snippet-only matches are
 * allowed only for multi-topic questions when at least two distinct subject terms match.
 */
function rankRelevantSearchResults(question, results, limit = 8) {
  const terms = getQuestionTerms(question).filter(term => !GENERIC_TERMS.has(term));
  if (!terms.length || !Array.isArray(results) || !results.length) return [];

  return results
    .map((result, index) => {
      const titleMatches = countMatchedConcepts(terms, result?.title || '');
      const snippetMatches = countMatchedConcepts(
        terms,
        [result?.snippet, result?.description].filter(Boolean).join(' ')
      );

      if (titleMatches === 0 && (terms.length < 2 || snippetMatches < 2)) {
        return null;
      }

      return {
        result,
        index,
        score: titleMatches * 4 + snippetMatches * 1.25,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, Number(limit) || 0))
    .map(item => item.result);
}

module.exports = {
  normalizeSearchText,
  getQuestionTerms,
  rankRelevantSearchResults,
};
