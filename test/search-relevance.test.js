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

test('rejects broad titles when the question has only one specific subject term', () => {
  const results = [
    { title: 'Health research', url: 'https://example.org/health', snippet: 'Research about the human heart and its function in circulation.' },
    { title: 'Jainism', url: 'https://example.org/jainism', snippet: 'A religious tradition.' },
  ];

  const filtered = rankRelevantSearchResults('د انسان د زړه دنده څه ده؟', results);

  assert.deepEqual(filtered.map(item => item.title), []);
});

test('crypto question prefers direct crypto titles over adjacent digital-money and exchange pages', () => {
  const results = [
    {
      title: 'د کريپټو کرنسۍ (ډیجیټلي پیسې) تنظیم',
      url: 'https://ps.wikipedia.org/wiki/crypto-regulation',
      snippet: 'د کریپټو کرنسۍ او ډیجیټلي پیسو د تنظیم په اړه.',
    },
    {
      title: 'ډېجېټل پیسې',
      url: 'https://ps.wikipedia.org/wiki/digital-money',
      snippet: 'ډیجیټلي پیسې، کریپټو کرنسي او د پیسو نوې بڼې.',
    },
    {
      title: 'کوین بیز',
      url: 'https://ps.wikipedia.org/wiki/coinbase',
      snippet: 'د کریپټو کرنسۍ د پېر او پلور یو تبادله‌ځای.',
    },
  ];

  const filtered = rankRelevantSearchResults('کریپټو کرنسي څه ده؟ تفصیلي ځواب راکړه؟', results);

  assert.deepEqual(
    filtered.map(item => item.title),
    ['د کريپټو کرنسۍ (ډیجیټلي پیسې) تنظیم'],
  );
});
