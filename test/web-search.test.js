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
