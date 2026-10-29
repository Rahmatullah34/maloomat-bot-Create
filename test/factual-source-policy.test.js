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

test('recognizes specialist Afghan and regional history sources', () => {
  assert.equal(
    isTrustedFactualSource({ url: 'https://www.iranicaonline.org/articles/afghanistan-x-political-history/' }),
    true,
  );
});

test('allows only the vetted 1911 Britannica Ahmad Shah transcription on Wikisource', () => {
  const curatedEntry = {
    title: 'Ahmad Shah (1724–1773) — 1911 Encyclopaedia Britannica',
    url: 'https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Ahmad_Shah',
    provider: 'Curated historical reference — 1911 Encyclopaedia Britannica',
  };
  assert.equal(isTrustedFactualSource(curatedEntry), true);
  assert.equal(
    isTrustedFactualSource({ url: 'https://en.wikisource.org/wiki/Random_history_article' }),
    false,
  );
});

test('keeps the two vetted Ahmad Shah references while excluding an unverified blog', () => {
  const results = [
    {
      title: 'Afghanistan x. Political History',
      url: 'https://www.iranicaonline.org/articles/afghanistan-x-political-history/',
    },
    {
      title: 'Ahmad Shah (1724–1773) — 1911 Encyclopaedia Britannica',
      url: 'https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Ahmad_Shah',
      provider: 'Curated historical reference — 1911 Encyclopaedia Britannica',
    },
    {
      title: 'Ahmad Shah Durrani',
      url: 'https://know-your-history.com/articles/ahmad-shah-durrani/',
    },
  ];
  assert.deepEqual(
    filterAuthoritativeFactualSources(results, 'احمدشاه بابا مهمې جګړې کومې وې؟', 'history')
      .map(item => item.title),
    [
      'Afghanistan x. Political History',
      'Ahmad Shah (1724–1773) — 1911 Encyclopaedia Britannica',
    ],
  );
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
