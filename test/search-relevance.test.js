'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { rankRelevantSearchResults } = require('../lib/search-relevance');

test('removes unrelated sources for a Pashto question about the human heart', () => {
  const results = [
    { title: 'جاينيزم', url: 'https://ps.wikipedia.org/wiki/جاينيزم', snippet: 'دین او فلسفه' },
    { title: 'زړه', url: 'https://ps.wikipedia.org/wiki/زړه', snippet: 'د انسان د بدن مهم غړی دی چې وینه پمپ کوي.' },
    { title: 'د لمر ضد عینکې', url: 'https://ps.wikipedia.org/wiki/د_لمر_ضد_عینکې', snippet: 'د سترګو د ساتنې لپاره کارېږي.' },
    { title: 'د انسان بدن', url: 'https://ps.wikipedia.org/wiki/د_انسان_بدن', snippet: 'د بدن د غړو عمومي پېژندنه.' },
  ];

  const filtered = rankRelevantSearchResults('د انسان د زړه دنده څه ده؟', results);

  assert.deepEqual(
    filtered.map(item => item.title),
    ['زړه'],
  );
});

test('matches an English source title to a Pashto topic', () => {
  const results = [
    { title: 'Jainism', url: 'https://en.wikipedia.org/wiki/Jainism', snippet: 'Religion and philosophy.' },
    { title: 'Heart', url: 'https://en.wikipedia.org/wiki/Heart', snippet: 'The heart pumps blood through the circulatory system.' },
  ];

  const filtered = rankRelevantSearchResults('د انسان د زړه دنده څه ده؟', results);

  assert.deepEqual(filtered.map(item => item.title), ['Heart']);
});

test('returns no links when all search results are unrelated', () => {
  const results = [
    { title: 'جاينيزم', url: 'https://ps.wikipedia.org/wiki/جاينيزم', snippet: 'د دین تاریخ.' },
    { title: 'د لمر ضد عینکې', url: 'https://ps.wikipedia.org/wiki/د_لمر_ضد_عینکې', snippet: 'د سترګو ساتنه.' },
  ];

  assert.deepEqual(rankRelevantSearchResults('د انسان د زړه دنده څه ده؟', results), []);
});

test('can retain a broad-titled result when its snippet matches multiple topic terms', () => {
  const results = [
    { title: 'Health research', url: 'https://example.org/health', snippet: 'Research about the human heart and its function in circulation.' },
    { title: 'Jainism', url: 'https://example.org/jainism', snippet: 'A religious tradition.' },
  ];

  const filtered = rankRelevantSearchResults('د انسان د زړه دنده څه ده؟', results);

  assert.deepEqual(filtered.map(item => item.title), ['Health research']);
});
