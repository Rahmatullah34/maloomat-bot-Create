'use strict';

const { isQuranRukuCountQuestion } = require('./religious-source-policy');

const STOP_WORDS = new Set([
  'د', 'په', 'له', 'او', 'یا', 'چې', 'دا', 'هغه', 'دی', 'ده', 'دي', 'دې',
  'څه', 'شی', 'څوک', 'چا', 'لیکلی', 'ليکلي', 'لیکل', 'لیکوال', 'څنګه', 'ولې', 'کوم', 'کومه', 'کومې', 'کومو', 'کوي', 'تفصیلي', 'مفصل', 'تفصیل', 'ځواب', 'ځوابونه', 'راکړئ',
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
const RELIGIOUS_CONTEXT_TERMS = new Set([
  'اسلام', 'اسلامي', 'اسلامی', 'مسلمان', 'دین', 'مذهب', 'حکم', 'شرعي', 'شرعی',
  'islam', 'islamic', 'muslim', 'religion', 'religious', 'faith', 'ruling', 'fiqh', 'jurisprudence',
]);

const TERM_ALIASES = {
  'قرآن': ['قرآن', 'قران', 'quran', "qur'an"],
  'قران': ['قرآن', 'قران', 'quran', "qur'an"],
  'رکوع': ['رکوع', 'ركوع', 'الرکوع', 'الركوع', 'رکوعات', 'ركوعات', 'ruku', 'rukus', 'rukoo', 'ruku section'],
  'رکوعات': ['رکوع', 'ركوع', 'الرکوع', 'الركوع', 'رکوعات', 'ركوعات', 'ruku', 'rukus', 'rukoo', 'ruku section'],
  'رکوعاتو': ['رکوع', 'ركوع', 'الرکوع', 'الركوع', 'رکوعات', 'ركوعات', 'ruku', 'rukus', 'rukoo', 'ruku section'],
  'تفسیر': ['تفسیر', 'تفسير', 'tafsir', 'tafseer', 'quran commentary', 'exegesis'],
  'تفسير': ['تفسیر', 'تفسير', 'tafsir', 'tafseer', 'quran commentary', 'exegesis'],
  'یسیر': ['یسیر', 'يسير', 'yaseer', 'yasir', 'yaser', 'tafseer yaseer', 'tafsir yaseer'],
  'پښتو': ['پښتو', 'pashto', 'pushto', 'pashtu'],
  'ږیره': ['ږیره', 'ږیرې', 'ږیري', 'beard', 'beards', 'facial hair', 'beard in islam', 'keeping a beard'],
  'ږیرې': ['ږیره', 'ږیرې', 'ږیري', 'beard', 'beards', 'facial hair', 'beard in islam', 'keeping a beard'],
  'ږیري': ['ږیره', 'ږیرې', 'ږیري', 'beard', 'beards', 'facial hair', 'beard in islam', 'keeping a beard'],
  'ږیر': ['ږیر', 'ږیره', 'ږیرې', 'beard', 'beards', 'facial hair'],
  'ګیره': ['ګیره', 'beard', 'beards', 'facial hair'],
  'خریل': ['خریل', 'خرییل', 'shave', 'shaving', 'shaving beard'],
  'پرېښودل': ['پرېښودل', 'پرېښودلو', 'keeping', 'leave', 'grow', 'growing'],
  'احمدشاه': ['احمدشاه', 'احمد شاه', 'ahmad shah', 'ahmed shah', 'ahmad shah durrani', 'ahmad shah abdali'],
  'احمد': ['احمد', 'ahmad', 'ahmed'],
  'بابا': ['بابا', 'baba'],
  'جګړه': ['جګړه', 'جګړې', 'battle', 'battles', 'war', 'wars'],
  'جګړې': ['جګړه', 'جګړې', 'battle', 'battles', 'war', 'wars', 'campaign', 'campaigns'],
  'لښکرکښۍ': ['لښکرکښۍ', 'military campaigns', 'campaigns', 'expeditions'],
  'مشهورې': ['مشهورې', 'مشهور', 'famous', 'major', 'notable'],
  'فیسبوک': ['فیسبوک', 'فېسبوک', 'فیس بوک', 'facebook', 'meta'],
  'فېسبوک': ['فیسبوک', 'فېسبوک', 'فیس بوک', 'facebook', 'meta'],
  'دفیسبوک': ['فیسبوک', 'فېسبوک', 'فیس بوک', 'facebook', 'meta'],
  'مونټایزیشن': ['مونټایزیشن', 'مونټایزېشن', 'مونیتایزیشن', 'منیټایزیشن', 'monetization', 'monetisation', 'monetize', 'monetise', 'creator monetization', 'content monetization'],
  'مونټایزېشن': ['مونټایزیشن', 'مونټایزېشن', 'مونیتایزیشن', 'منیټایزیشن', 'monetization', 'monetisation', 'monetize', 'monetise', 'creator monetization', 'content monetization'],
  'منیتایزیشن': ['مونټایزیشن', 'مونټایزېشن', 'monetization', 'monetisation', 'creator monetization', 'content monetization'],
  'مونټایز': ['مونټایز', 'monetize', 'monetise', 'monetization', 'monetisation'],
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
  'کریپټو': ['کریپټو', 'کريپټو', 'کرېپټو', 'crypto', 'cryptocurrency', 'cryptocurrencies'],
  'کريپټو': ['کریپټو', 'کريپټو', 'کرېپټو', 'crypto', 'cryptocurrency', 'cryptocurrencies'],
  'کرنسي': ['کرنسي', 'کرنسۍ', 'کرنسی', 'currency', 'currencies'],
  'کرنسۍ': ['کرنسي', 'کرنسۍ', 'کرنسی', 'currency', 'currencies'],
  'بیتکوین': ['بیتکوین', 'بټکوین', 'bitcoin'],
  'بټکوین': ['بیتکوین', 'بټکوین', 'bitcoin'],
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


function sourceAuthorityScore(rawUrl, provider = '') {
  let hostname = '';
  try {
    hostname = new URL(String(rawUrl || '')).hostname.toLowerCase();
  } catch {
    return 0;
  }
  if (!hostname) return 0;
  if (hostname === 'about.fb.com' || hostname === 'who.int' || hostname.endsWith('.who.int') ||
      hostname === 'nasa.gov' || hostname.endsWith('.nasa.gov') ||
      hostname === 'un.org' || hostname.endsWith('.un.org') ||
      hostname.endsWith('.gov') || hostname.includes('.gov.') ||
      hostname.endsWith('.edu') || hostname.includes('.edu.') ||
      hostname === 'loc.gov' || hostname.endsWith('.loc.gov')) return 5;
  if (/(^|\.)britannica\.com$|(^|\.)iranicaonline\.org$|(^|\.)oxfordreference\.com$|(^|\.)jstor\.org$|(^|\.)academic\.oup\.com$|(^|\.)archives\.gov$|(^|\.)history\.state\.gov$/.test(hostname)) return 4.5;
  if (/(^|\.)reuters\.com$|(^|\.)apnews\.com$|(^|\.)bbc\.com$|(^|\.)theguardian\.com$/.test(hostname)) return 4;
  if (hostname === 'wikipedia.org' || hostname.endsWith('.wikipedia.org')) return 2.5;
  if (/meta official|official fallback/i.test(String(provider || ''))) return 4.5;
  return 1;
}

/**
 * Filters and ranks search results against the user's question.
 * A result should match the specific subject in its title. Snippet-only matches are
 * allowed only for multi-topic questions when at least two distinct subject terms match.
 */
function rankRelevantSearchResults(question, results, limit = 8) {
  const allTerms = getQuestionTerms(question).filter(term => !GENERIC_TERMS.has(term));
  // When a religious question also names a specific topic, words such as “Islam”
  // or “ruling” must not make an unrelated general-religion page look relevant.
  const hasSpecificSubject = allTerms.some(term => !RELIGIOUS_CONTEXT_TERMS.has(term));
  const terms = hasSpecificSubject
    ? allTerms.filter(term => !RELIGIOUS_CONTEXT_TERMS.has(term))
    : allTerms;
  const normalizedQuestion = normalizeSearchText(question).normalize('NFD').replace(/\p{M}/gu, '');
  const asksQuranRukuCount = isQuranRukuCountQuestion(question);
  const isAhmadShahQuestion =
    /(?:احمد\s*شاه|احمدشاه|ahmad\s+shah|ahmed\s+shah|durrani|dorrani|abdali)/iu.test(normalizedQuestion);
  const asksAhmadShahBattles =
    isAhmadShahQuestion && /(?:جګړ|لښکرکښ|پوځي|battle|campaign|war|military)/iu.test(normalizedQuestion);

  // Funeral-prayer pages are a distinct topic and should not be cited for
  // ordinary daily-prayer obligations unless the user asks about janazah.
  const asksOrdinaryPrayerObligations =
    /(?:لمونځ|لمانځه|نماز|salah|salat|namaz|prayer)/iu.test(normalizedQuestion) &&
    /(?:فرضونه|فرض|obligations?|obligatory|duties|pillars|required)/iu.test(normalizedQuestion) &&
    !/(?:جنازه|جنازې|نماز جنازه|funeral prayer|janazah|janaza|salat al janazah)/iu.test(normalizedQuestion);

  function mentionsAhmadShah(value) {
    const text = normalizeSearchText(value).normalize('NFD').replace(/\p{M}/gu, '');
    return /(?:ahmad\s+shah|ahmed\s+shah|ahmad\s+khan|durrani|dorrani|abdali|احمد\s*شاه|احمدشاه)/iu.test(text);
  }
  if (!terms.length || !Array.isArray(results) || !results.length) return [];

  const ranked = results
    .map((result, index) => {
      const titleMatches = countMatchedConcepts(terms, result?.title || '');
      const title = String(result?.title || '');
      const excerpt = [result?.snippet, result?.description].filter(Boolean).join(' ');
      const normalizedTitle = normalizeSearchText(title);
      if (asksOrdinaryPrayerObligations &&
          /(?:funeral prayer|janazah|janaza|salat al janazah|funeral salah)/iu.test(normalizedTitle)) {
        return null;
      }
      const snippetMatches = countMatchedConcepts(terms, excerpt);

      // A generic Quran page is not relevant to a Ruku count unless the result
      // actually discusses Ruku; reject broad Quran/disambiguation pages.
      if (asksQuranRukuCount && !/(?:ر[کك]وع|ruku|rukoo|rukū)/iu.test(title + ' ' + excerpt)) {
        return null;
      }

      // د احمدشاه بابا په اړه یوازې د متن له یادونې سره نامربوطه پاڼه مه منئ.
      // د جګړو په پوښتنو کې ځانګړې جګړه (لکه Panipat) منل کېدای شي، خو متن باید
      // هم احمدشاه/دراني/ابدالي په څرګند ډول یاد کړي.
      if (isAhmadShahQuestion) {
        const titleNamesAhmadShah = mentionsAhmadShah(title);
        const isNamedBattle = /(?:panipat|manupur|manipur|sirhind|pani\s*pat|پاني\s*پت|پانې\s*پت)/iu.test(title);
        if (!titleNamesAhmadShah && !(asksAhmadShahBattles && isNamedBattle && mentionsAhmadShah(excerpt))) {
          return null;
        }
      }

      if (titleMatches === 0 && (terms.length < 2 || snippetMatches < 2)) {
        return null;
      }

      return {
        result,
        index,
        titleMatches,
        authorityScore: sourceAuthorityScore(result?.url, result?.provider),
        score: titleMatches * 4 + snippetMatches * 1.25,
      };
    })
    .filter(Boolean);

  // که لږ تر لږه یوه پایله په خپل سرلیک کې د پوښتنې موضوع ولري،
  // یوازې هغه سرلیک-اړوندې پایلې وساته؛ د متن له یوې برخې سره ورته والی
  // باید نامربوطې څنګلوري پاڼې د سرچینو په لېست کې داخلې نه کړي.
  const titleRelevant = ranked.filter(item => item.titleMatches > 0);
  return (titleRelevant.length ? titleRelevant : ranked)
    .sort((a, b) => b.score - a.score || b.authorityScore - a.authorityScore || a.index - b.index)
    .slice(0, Math.max(0, Number(limit) || 0))
    .map(item => item.result);
}

function rankRelevantSearchResultsAcrossQueries(queries, results, limit = 8) {
  const queryList = [...new Set(
    (Array.isArray(queries) ? queries : [queries])
      .map(query => String(query || '').replace(/\\s+/g, ' ').trim())
      .filter(Boolean)
      .map(query => query.toLowerCase())
  )];
  const sourceList = Array.isArray(results) ? results.filter(Boolean) : [];
  const maximum = Math.max(0, Number(limit) || 0);
  if (!queryList.length || !sourceList.length || maximum === 0) return [];

  const rankedByUrl = new Map();

  for (let queryIndex = 0; queryIndex < queryList.length; queryIndex += 1) {
    const ranked = rankRelevantSearchResults(queryList[queryIndex], sourceList, sourceList.length);
    for (let rankIndex = 0; rankIndex < ranked.length; rankIndex += 1) {
      const result = ranked[rankIndex];
      let key = '';
      try {
        const url = new URL(String(result?.url || ''));
        if (!['http:', 'https:'].includes(url.protocol)) continue;
        url.hash = '';
        key = url.href.replace(/\\/$/, '');
      } catch {
        key = String(result?.title || '').trim().toLowerCase();
      }
      if (!key) continue;

      const rankScore = 100 - rankIndex * 5;
      const existing = rankedByUrl.get(key) || {
        result,
        bestRankScore: -Infinity,
        queryMatches: 0,
        firstQueryIndex: queryIndex,
        originalIndex: sourceList.indexOf(result),
      };
      existing.queryMatches += 1;
      if (rankScore > existing.bestRankScore) {
        existing.bestRankScore = rankScore;
        existing.result = result;
        existing.firstQueryIndex = queryIndex;
      }
      rankedByUrl.set(key, existing);
    }
  }

  return [...rankedByUrl.values()]
    .sort((a, b) => {
      const scoreA = a.bestRankScore + Math.max(0, a.queryMatches - 1) * 0.5;
      const scoreB = b.bestRankScore + Math.max(0, b.queryMatches - 1) * 0.5;
      return scoreB - scoreA ||
        sourceAuthorityScore(b.result?.url, b.result?.provider) -
          sourceAuthorityScore(a.result?.url, a.result?.provider) ||
        a.firstQueryIndex - b.firstQueryIndex ||
        a.originalIndex - b.originalIndex;
    })
    .slice(0, maximum)
    .map(item => item.result);
}

module.exports = {
  normalizeSearchText,
  getQuestionTerms,
  rankRelevantSearchResults,
  rankRelevantSearchResultsAcrossQueries,
  sourceAuthorityScore,
};
