'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  requiresFactualSourceEvidence,
  isTrustedFactualSource,
  filterAuthoritativeFactualSources,
} = require('../lib/factual-source-policy');

test('requires source evidence for historical and scientific questions', () => {
  assert.equal(requiresFactualSourceEvidence('د سړې جګړې تاریخ څه و؟', 'history'), true);
  assert.equal(requiresFactualSourceEvidence('DNA څه شی دی؟', 'science'), true);
});

test('detects political and ideological topics even when the general classifier has no category', () => {
  assert.equal(requiresFactualSourceEvidence('فکري جګړه څه ده؟', 'history'), true);
  assert.equal(requiresFactualSourceEvidence('What is political propaganda?', 'general'), true);
  assert.equal(requiresFactualSourceEvidence('د حکومت د پالیسۍ اغېز څه دی؟', 'general'), true);
});

test('does not require external sources for an ordinary greeting or simple translation', () => {
  assert.equal(requiresFactualSourceEvidence('سلام، څنګه یې؟', 'general'), false);
  assert.equal(requiresFactualSourceEvidence('دا جمله وژباړه', 'translation'), false);
});

test('recognizes credible institutional, academic, and established news sources', () => {
  assert.equal(isTrustedFactualSource({ url: 'https://www.nasa.gov/news/' }), true);
  assert.equal(isTrustedFactualSource({ url: 'https://www.britannica.com/topic/Cold-War' }), true);
  assert.equal(isTrustedFactualSource({ url: 'https://www.reuters.com/world/' }), true);
  assert.equal(isTrustedFactualSource({ url: 'https://history.state.gov/milestones' }), true);
  assert.equal(isTrustedFactualSource({ url: 'https://www.cambridge.org/core/journals' }), true);
});

test('does not treat Wikipedia, random blogs, or malformed URLs as authoritative evidence', () => {
  assert.equal(isTrustedFactualSource({ url: 'https://en.wikipedia.org/wiki/Cold_War' }), false);
  assert.equal(isTrustedFactualSource({ url: 'https://random-blog.example/history' }), false);
  assert.equal(isTrustedFactualSource({ url: 'javascript:alert(1)' }), false);
  assert.equal(isTrustedFactualSource({ url: 'not a URL' }), false);
});

test('filters out weak results for source-required topics but leaves ordinary-topic results unchanged', () => {
  const results = [
    { title: 'Cold War', url: 'https://en.wikipedia.org/wiki/Cold_War' },
    { title: 'The Cold War', url: 'https://www.britannica.com/event/Cold-War' },
    { title: 'Random claims', url: 'https://random-blog.example/cold-war' },
  ];

  assert.deepEqual(
    filterAuthoritativeFactualSources(results, 'د سړې جګړې تاریخ', 'history').map(item => item.title),
    ['The Cold War'],
  );
  assert.equal(
    filterAuthoritativeFactualSources(results, 'دا اصطلاح څه معنا لري؟', 'general').length,
    3,
  );
  assert.deepEqual(filterAuthoritativeFactualSources(null, 'د ساینس پوښتنه', 'science'), []);
});
