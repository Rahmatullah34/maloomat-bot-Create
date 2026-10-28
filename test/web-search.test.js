'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSearchQueries,
  getCuratedFallbackSources,
  getSearchPageHint,
  isFacebookMonetizationQuestion,
  parseDuckDuckGoResults,
} = require('../lib/web-search');

test('extracts DuckDuckGo result links and decodes HTML text', () => {
  const html = [
    '<div class="result">',
    '<a class="result__a" href="https://example.org/page">Facebook &amp; creators</a>',
    '<div class="result__snippet">Official <b>guide</b> &amp; eligibility.</div>',
    '</div>',
  ].join('');

  const results = parseDuckDuckGoResults(html);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Facebook & creators');
  assert.equal(results[0].url, 'https://example.org/page');
  assert.match(results[0].snippet, /Official guide & eligibility/);
});

test('recognizes an alternate result test-id used by changed search markup', () => {
  const html = '<a data-testid="result-title-a" href="https://example.org/guide"><h2>Creator guide</h2></a>';
  const results = parseDuckDuckGoResults(html);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Creator guide');
});

test('unwraps DuckDuckGo redirect URLs to the destination URL', () => {
  const html = '<a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Farticle">Article</a>';
  const results = parseDuckDuckGoResults(html);
  assert.equal(results.length, 1);
  assert.equal(results[0].url, 'https://example.org/article');
});

test('diagnoses a challenge page without attempting to bypass it', () => {
  assert.match(getSearchPageHint('<html><title>Challenge</title><div class="anomaly-modal">verify you are human</div></html>'), /تایید/);
});

test('expands Pashto Facebook monetization questions into a useful English query', () => {
  const question = 'دفیسبوک مونټایزیشن مکمل طریقه او لارښوون';
  const queries = buildSearchQueries(question);
  assert.equal(isFacebookMonetizationQuestion(question), true);
  assert.ok(queries.some((item) => /Facebook Content Monetization eligibility/i.test(item)));
  assert.ok(queries.length <= 3);
});

test('builds targeted English searches for a detailed Pashto Islamic question', () => {
  const queries = buildSearchQueries('د قیامت وړې نښې مفصل او کتابونو معلومات راکړه؟');
  assert.equal(queries.length, 3);
  assert.ok(queries.some(query => /minor signs of the Hour/i.test(query)));
  assert.ok(queries.some(query => /Day of Judgment.*hadith/i.test(query)));
});

test('builds source-oriented English searches for general Islamic questions', () => {
  const queries = buildSearchQueries('د اسلام پنځه بناوې څه دي؟');
  assert.ok(queries.some(query => /Five Pillars of Islam/i.test(query)));
});

test('builds Quran-ruku-specific searches and curated sources instead of generic Quran pages', () => {
  const question = 'قرآن کریم څو رکوع ګانې لري؟';
  assert.deepEqual(buildSearchQueries(question), [
    'Quran ruku count 540 558 differences scholarly study',
    'Quran Foundation API list of all rukus count 558',
    'مصطلح الركوع في المصاحف 540 558 اختلاف عدد الركوعات',
  ]);

  const sources = getCuratedFallbackSources(question);
  assert.equal(sources.length, 2);
  assert.ok(sources.some(item => /api-docs\.quran\.foundation/.test(item.url) && /558/.test(item.snippet)));
  assert.ok(sources.some(item => /search\.manduamah\.com/.test(item.url) && /540.*558|558.*540/.test(item.snippet)));
  assert.ok(sources.every(item => item.provider.startsWith('Curated Quran ruku reference')));
});

test('provides an official Meta fallback source for Facebook monetization when search fails', () => {
  const results = getCuratedFallbackSources('د فیسبوک مونټایزیشن طریقه څه ده؟');
  assert.equal(results.length, 1);
  assert.equal(results[0].provider, 'Meta Official fallback');
  assert.match(results[0].url, /^https:\/\/about\.fb\.com\//);
  assert.deepEqual(getCuratedFallbackSources('د زړه دنده څه ده؟'), []);
});


test('adds English research queries for detailed Ahmad Shah Baba battle questions', () => {
  const queries = buildSearchQueries('د احمدشاه بابا اړوند تفصيلي ځواب؟ دهغه مشهورې جګړې؟');
  assert.ok(queries.length <= 3);
  assert.ok(queries.some((query) => /Ahmad Shah Durrani.*battles/i.test(query)));
  assert.ok(queries.some((query) => /Panipat 1761/i.test(query)));
});


test('uses short, specific English searches for Ahmad Shah Baba battle questions', () => {
  const queries = buildSearchQueries('د احمدشاه بابا اړوند تفصيلي ځواب؟ د هغه مشهورې جګړې؟');
  assert.deepEqual(queries, [
    'Ahmad Shah Durrani major military campaigns and battles',
    'Third Battle of Panipat 1761 Ahmad Shah Durrani',
    'Ahmad Shah Durrani campaigns Punjab Maratha Sikh',
  ]);
});

test('provides historical reference fallbacks when Ahmad Shah searches fail', () => {
  const results = getCuratedFallbackSources('د احمدشاه بابا تفصیلي معلومات او مشهورې جګړې');
  assert.equal(results.length, 3);
  assert.ok(results.some((item) => /iranica/i.test(item.provider) && /iranicaonline\.org/.test(item.url)));
  assert.ok(results.some((item) => /britannica/i.test(item.provider) && /wikisource\.org/.test(item.url)));
  assert.ok(results.every((item) => item.provider.startsWith('Curated historical reference')));
});

test('provides a book-specific fallback for Tafsir Yaseer authorship questions', () => {
  const results = getCuratedFallbackSources('تفسیر یسیر پښتو کې چا لیکلی؟');
  assert.equal(results.length, 1);
  assert.match(results[0].title, /تفسير یسیر/);
  assert.match(results[0].snippet, /لیکوال.*مولوي مراد علي/);
  assert.match(results[0].url, /pashtonlegacylibrarykandahar\.com/);
  assert.deepEqual(getCuratedFallbackSources('د زړه دنده څه ده؟'), []);
});
