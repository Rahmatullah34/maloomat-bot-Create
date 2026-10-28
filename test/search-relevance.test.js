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

test('rejects generic Quran pages for a Ruku-count question', () => {
  const results = [
    {
      title: 'Quran',
      url: 'https://en.wikipedia.org/wiki/Quran',
      snippet: 'The Quran is the central religious text of Islam.',
    },
    {
      title: 'Quran (disambiguation)',
      url: 'https://en.wikipedia.org/wiki/Quran_(disambiguation)',
      snippet: 'Quran may refer to several related topics.',
    },
    {
      title: 'List Rukus — Quran Foundation Content API',
      url: 'https://api-docs.quran.foundation/docs/content_apis_versioned/4.0.0/list-rukus/',
      snippet: 'The Quran Foundation Content API lists Rukus and documents numbering up to 558.',
    },
  ];

  const filtered = rankRelevantSearchResults('قرآن کریم څو رکوع ګانې لري؟', results);
  assert.deepEqual(filtered.map(item => item.title), ['List Rukus — Quran Foundation Content API']);
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


test('matches Facebook Content Monetization official titles to a Pashto question', () => {
  const results = [
    {
      title: 'Facebook Content Monetization — Meta official guide',
      url: 'https://about.fb.com/news/2026/03/creator-fast-track-grow-your-audience-earn-money-on-facebook/',
      snippet: 'Eligible creators can express interest through the Professional Dashboard.',
    },
    {
      title: 'Jainism',
      url: 'https://example.org/jainism',
      snippet: 'A religious tradition.',
    },
  ];

  const filtered = rankRelevantSearchResults('دفیسبوک مونټایزیشن مکمل طریقه او لارښوون', results);

  assert.deepEqual(filtered.map((item) => item.title), ['Facebook Content Monetization — Meta official guide']);
});


test('matches Ahmad Shah Durrani and battles in English source titles', () => {
  const results = [
    { title: 'Ahmad Shah Durrani: military campaigns and battles', url: 'https://iranicaonline.org/articles/ahmad-shah-durrani', snippet: 'Historical overview of the Durrani ruler.' },
    { title: 'Jainism', url: 'https://example.org/jainism', snippet: 'A religious tradition.' },
  ];
  const filtered = rankRelevantSearchResults('د احمدشاه بابا مشهورې جګړې', results);
  assert.deepEqual(filtered.map((item) => item.title), ['Ahmad Shah Durrani: military campaigns and battles']);
});

test('prefers more authoritative sources when relevance is otherwise equal', () => {
  const results = [
    { title: 'Ahmad Shah Durrani battles', url: 'https://random-blog.example/battles', snippet: 'Ahmad Shah Durrani battles and campaigns.' },
    { title: 'Ahmad Shah Durrani battles', url: 'https://iranicaonline.org/articles/ahmad-shah-durrani', snippet: 'Ahmad Shah Durrani battles and campaigns.' },
  ];
  const filtered = rankRelevantSearchResults('احمدشاه بابا مشهورې جګړې', results);
  assert.equal(filtered[0].url, 'https://iranicaonline.org/articles/ahmad-shah-durrani');
});


test('rejects a tangential Raghunath Rao page for an Ahmad Shah battles question', () => {
  const results = [
    {
      title: 'Raghunath Rao',
      url: 'https://en.wikipedia.org/wiki/Raghunath_Rao',
      snippet: 'The Maratha commander opposed the forces of Ahmad Shah Durrani in northern India.',
    },
    {
      title: 'Third Battle of Panipat',
      url: 'https://en.wikipedia.org/wiki/Third_Battle_of_Panipat',
      snippet: 'Ahmad Shah Durrani led an Afghan coalition against the Maratha Confederacy on 14 January 1761.',
    },
  ];
  const filtered = rankRelevantSearchResults('د احمدشاه بابا مشهورې جګړې', results);
  assert.deepEqual(filtered.map((item) => item.title), ['Third Battle of Panipat']);
});

test('rejects Ahmad Shah mentions in snippets when the result title is unrelated', () => {
  const results = [
    {
      title: 'Raghunath Rao',
      url: 'https://en.wikipedia.org/wiki/Raghunath_Rao',
      snippet: 'Ahmad Shah Durrani and Maratha forces clashed during the campaign.',
    },
  ];
  assert.deepEqual(rankRelevantSearchResults('د احمدشاه بابا تفصیلي معلومات', results), []);
});

test('rejects funeral-prayer pages for questions about ordinary prayer obligations', () => {
  const results = [
    { title: 'Funeral prayer (Islam)', url: 'https://en.wikipedia.org/wiki/Funeral_prayer_(Islam)', snippet: 'The Islamic funeral prayer.' },
    { title: 'Salah', url: 'https://en.wikipedia.org/wiki/Salah', snippet: 'The ritual daily prayer in Islam.' },
    { title: 'Islamic prayer obligations', url: 'https://example.org/islamic-prayer-obligations', snippet: 'Required parts of the daily salah prayer.' },
  ];
  const filtered = rankRelevantSearchResults('د لمانځه فرضونه کوم دي؟', results);
  assert.ok(filtered.some(item => item.title === 'Salah'));
  assert.ok(filtered.some(item => item.title === 'Islamic prayer obligations'));
  assert.ok(filtered.every(item => item.title !== 'Funeral prayer (Islam)'));
});

test('rejects a general Islam page for a specific beard ruling question', () => {
  const results = [
    { title: 'په اسلام کي د شورا ارزښت', url: 'https://ps.wikipedia.org/wiki/شورا', snippet: 'د اسلام د شورا او مشورې ارزښت.' },
    { title: 'Beard in Islam', url: 'https://en.wikipedia.org/wiki/Religious_views_on_beards', snippet: 'Religious views on beards include Islamic teachings and differing scholarly views.' },
    { title: 'Sahih al-Bukhari: Trim the moustache and grow the beard', url: 'https://sunnah.com/bukhari:5892', snippet: 'The report concerns trimming the moustache and leaving the beard.' },
  ];
  const filtered = rankRelevantSearchResults('د ږیرې خریل په اسلام کې څه حکم دی؟', results);
  assert.ok(filtered.some(item => /Beard in Islam/i.test(item.title)));
  assert.ok(filtered.some(item => /Sahih al-Bukhari/i.test(item.title)));
  assert.ok(filtered.every(item => !/شورا|consultation/i.test(item.title)));
});

test('returns no generic religious link when the specific subject is absent', () => {
  const results = [{ title: 'په اسلام کي د شورا ارزښت', url: 'https://ps.wikipedia.org/wiki/شورا', snippet: 'د اسلام د شورا او مشورې ارزښت.' }];
  assert.deepEqual(rankRelevantSearchResults('د ږیرې خریل په اسلام کې څه حکم دی؟', results), []);
});

test('matches Pashto book-title aliases and rejects generic Quran pages for Tafsir Yaseer', () => {
  const results = [
    { title: 'Quran', url: 'https://en.wikipedia.org/wiki/Quran', snippet: 'The Quran is the central religious text of Islam.' },
    { title: 'Tafseer Yaseer Pashto author Maulvi Murad Ali', url: 'https://pashtonlegacylibrarykandahar.com/books1/3974', snippet: 'Tafseer Yaseer is a Pashto commentary and its author is listed as Maulvi Murad Ali.' },
  ];
  const filtered = rankRelevantSearchResults('تفسیر یسیر پښتو کې چا لیکلی؟', results);
  assert.deepEqual(filtered.map(item => item.title), ['Tafseer Yaseer Pashto author Maulvi Murad Ali']);
});
