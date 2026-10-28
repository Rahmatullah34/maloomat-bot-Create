'use strict';

function normalizeBookSourceText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

function isTafsirYaseerAuthorshipQuestion(question) {
  const value = normalizeBookSourceText(question);
  const namesWork = /(?:تفسیر|تفسير|tafsir|tafseer|tafsir).{0,35}(?:یسیر|يسير|yaseer|yasir|yaser)|(?:یسیر|يسير|yaseer|yasir|yaser).{0,35}(?:تفسیر|تفسير|tafsir|tafseer)/iu.test(value);
  const asksAuthor = /(?:چا\s*(?:لیکلی|ليکلي|ليکلى|لیکل)|لیکوال|لیکونکی|مولف|مؤلف|مصنف|who\s+wrote|author\s+of|authored\s+by|written\s+by)/iu.test(value);
  return namesWork && asksAuthor;
}

function isTafsirYaseerAuthorSource(result) {
  if (!result || typeof result !== 'object') return false;
  const title = normalizeBookSourceText(result.title);
  const excerpt = normalizeBookSourceText([
    result.snippet,
    result.description,
    result.extract,
    result.excerpt,
    result.text,
  ].filter(Boolean).join(' '));
  const fullText = title + ' ' + excerpt;

  const namesWork = /(?:تفسیر|تفسير|tafsir|tafseer)/iu.test(fullText) &&
    /(?:یسیر|يسير|yaseer|yasir|yaser|فوق الیسیر|فوق اليسير)/iu.test(fullText);
  const givesAttribution = /(?:لیکوال|لیکونکی|مولف|مؤلف|مصنف|author|authored\s+by|written\s+by|مولوي\s+مراد\s+علي|مولوی\s+مراد\s+علی|مراد\s+علي\s+کاموي|مراد\s+علي\s+صاحبزاده|murad\s+ali|kamawi|sahibzada)/iu.test(fullText);

  return namesWork && givesAttribution && fullText.length >= 45;
}

function filterTafsirYaseerAuthorSources(results) {
  if (!Array.isArray(results)) return [];
  return results.filter(isTafsirYaseerAuthorSource);
}

module.exports = {
  isTafsirYaseerAuthorshipQuestion,
  isTafsirYaseerAuthorSource,
  filterTafsirYaseerAuthorSources,
};
