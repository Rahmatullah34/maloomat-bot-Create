'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isTrustedReligiousDomain,
  isTrustedReligiousSource,
  filterTrustedReligiousSources,
  hasTrustedReligiousReferenceText,
  requiresAuthoritativeReligiousSource,
  isQuranRukuCountQuestion,
  isQuranLongestWordQuestion,
  asksForReligiousReferences,
} = require('../lib/religious-source-policy');

test('accepts established primary-text and academic reference domains', () => {
  assert.equal(isTrustedReligiousDomain('https://sunnah.com/bukhari:8'), true);
  assert.equal(isTrustedReligiousDomain('https://quran.com/2'), true);
  assert.equal(isTrustedReligiousDomain('https://www.britannica.com/topic/religion'), true);
  assert.equal(isTrustedReligiousDomain('https://www.vatican.va/'), true);
  assert.equal(isTrustedReligiousDomain('https://www.sefaria.org/'), true);
  assert.equal(isTrustedReligiousDomain('https://pashtonlegacylibrarykandahar.com/books1/3974'), true);
});

test('does not accept lookalike or unrelated domains', () => {
  assert.equal(isTrustedReligiousDomain('https://sunnah.com.fake-example.org/page'), false);
  assert.equal(isTrustedReligiousDomain('https://fake.sunnah.com/bukhari:8'), false);
  assert.equal(isTrustedReligiousDomain('https://notquran.com/'), false);
  assert.equal(isTrustedReligiousDomain('javascript:alert(1)'), false);
  assert.equal(isTrustedReligiousDomain('not a URL'), false);
  assert.equal(isTrustedReligiousDomain('https://random-blog.example/religion'), false);
  assert.equal(isTrustedReligiousDomain('http://sunnah.com/bukhari:8'), false);
});

test('requires a title and actual excerpt text, not only a trusted URL', () => {
  assert.equal(isTrustedReligiousSource({
    title: 'Sahih al-Bukhari',
    url: 'https://sunnah.com/bukhari:8',
    snippet: 'The text of the report is available in this excerpt and supports a claim.',
  }), true);

  assert.equal(isTrustedReligiousSource({
    title: 'Sahih al-Bukhari',
    url: 'https://sunnah.com/bukhari:8',
    snippet: '',
  }), false);

  assert.equal(isTrustedReligiousSource({
    title: 'x',
    url: 'https://sunnah.com/bukhari:8',
    snippet: 'This is a usable excerpt but the title is not meaningful.',
  }), false);
});

test('accepts an offline religious answer only when it includes an approved reference link', () => {
  assert.equal(hasTrustedReligiousReferenceText('حواله: https://sunnah.com/bukhari:8'), true);
  assert.equal(hasTrustedReligiousReferenceText('حواله: https://random-blog.example/article'), false);
  assert.equal(hasTrustedReligiousReferenceText('د سرچینې لینک نشته'), false);
});

test('allows encyclopedic references for general religious background questions', () => {
  const wiki = {
    title: 'Islam',
    url: 'https://en.wikipedia.org/wiki/Islam',
    snippet: 'Islam is an Abrahamic monotheistic religion whose central text is the Quran.',
  };
  assert.equal(isTrustedReligiousSource(wiki, 'What is Islam?'), true);
  assert.deepEqual(filterTrustedReligiousSources([wiki], 'What is Islam?').map(item => item.title), ['Islam']);
});

test('distinguishes general religious background from precise religious claims', () => {
  assert.equal(requiresAuthoritativeReligiousSource('د قیامت وړې نښې مفصل او کتابونو معلومات راکړه؟'), false);
  assert.equal(requiresAuthoritativeReligiousSource('What is a hadith?'), false);
  assert.equal(requiresAuthoritativeReligiousSource('د لمانځه فرضونه کوم دي؟'), false);
  assert.equal(requiresAuthoritativeReligiousSource('د روژې فرضونه کوم دي؟'), false);
  assert.equal(requiresAuthoritativeReligiousSource('د دې حدیث کره حواله او شمېره راکړه؟'), true);
  assert.equal(requiresAuthoritativeReligiousSource('ایا دا عمل حلال دی که حرام؟'), true);
  assert.equal(requiresAuthoritativeReligiousSource('د قرآن د دې آیت کره متن او شمېره راکړه؟'), true);
});

test('recognizes Quran ruku-count questions and permits only its targeted references', () => {
  const question = 'قرآن کریم څو رکوع ګانې لري؟';
  assert.equal(isQuranRukuCountQuestion(question), true);
  assert.equal(isQuranRukuCountQuestion('د لمانځه رکوع څنګه ادا کېږي؟'), false);
  assert.equal(requiresAuthoritativeReligiousSource(question), true);

  const apiSource = {
    title: 'List Rukus — Quran Foundation Content API',
    url: 'https://api-docs.quran.foundation/docs/content_apis_versioned/4.0.0/list-rukus/',
    snippet: 'The Quran Foundation Content API documents the ruku numbering convention and values from 1 through 558.',
  };
  const scholarlySource = {
    title: 'مصطلح الركوع في المصاحف: مدلوله، نشأته، وأقوال العلماء فيه',
    url: 'https://search.mandumah.com/Record/771156',
    snippet: 'A peer-reviewed 2016 research article discusses differing Ruku divisions, including 540 and 558 in different printed mushaf conventions.',
  };
  const wiki = {
    title: 'Quran',
    url: 'https://en.wikipedia.org/wiki/Quran',
    snippet: 'The Quran is the central religious text of Islam, believed by Muslims to be a revelation from God.',
  };

  assert.equal(isTrustedReligiousSource(apiSource, question), true);
  assert.equal(isTrustedReligiousSource(scholarlySource, question), true);
  assert.equal(isTrustedReligiousSource(wiki, question), false);
  assert.equal(hasTrustedReligiousReferenceText(apiSource.url, question), true);
  assert.equal(hasTrustedReligiousReferenceText(scholarlySource.url, question), true);
  assert.equal(hasTrustedReligiousReferenceText(wiki.url, question), false);
});

test('requires authoritative Islamic sources for hadith, citations, and rulings', () => {
  const wiki = {
    title: 'Signs of the Hour',
    url: 'https://en.wikipedia.org/wiki/Signs_of_the_hour',
    snippet: 'An explanatory overview that mentions several traditions and beliefs about the end times.',
  };
  const hadith = {
    title: 'Sahih al-Bukhari 1036',
    url: 'https://sunnah.com/bukhari:1036',
    snippet: 'A source text containing the narrated wording and the identified hadith reference.',
  };

  assert.equal(isTrustedReligiousSource(wiki, 'د حدیث کره حواله او شمېره راکړه'), false);
  assert.equal(isTrustedReligiousSource(wiki, 'د قیامت وړې نښې مفصل او کتابونو معلومات راکړه؟'), true);
  assert.deepEqual(
    filterTrustedReligiousSources([wiki, hadith], 'د حدیث کره حواله او شمېره راکړه').map(item => item.title),
    ['Sahih al-Bukhari 1036'],
  );
  assert.equal(hasTrustedReligiousReferenceText('https://en.wikipedia.org/wiki/Signs_of_the_hour', 'کتابونو حوالې راکړه'), true);
  assert.equal(hasTrustedReligiousReferenceText('https://sunnah.com/bukhari:1036', 'کتابونو حوالې راکړه'), true);
});

test('filters untrusted blogs and empty snippets from religious search results', () => {
  const results = [
    {
      title: 'Primary hadith text',
      url: 'https://sunnah.com/bukhari:8',
      snippet: 'A substantive passage from a primary text, long enough to serve as evidence.',
    },
    {
      title: 'Religious advice blog',
      url: 'https://random-blog.example/post',
      snippet: 'A substantive passage that is not on a recognized primary text or reference site.',
    },
    {
      title: 'Trusted URL without content',
      url: 'https://quran.com/2',
      snippet: '',
    },
  ];

  assert.deepEqual(
    filterTrustedReligiousSources(results).map(item => item.title),
    ['Primary hadith text'],
  );
  assert.deepEqual(filterTrustedReligiousSources(null), []);
});

test('distinguishes explicit source requests from general religious questions', () => {
  assert.equal(asksForReligiousReferences('د قیامت وړې نښې مفصل او د کتابونو له حوالو سره راکړه؟'), true);
  assert.equal(asksForReligiousReferences('د اسلام معنا څه ده؟'), false);
  assert.equal(asksForReligiousReferences('Give me the source references for this claim'), true);
});

test('requires authoritative sources for Quran longest-word questions and rejects generic Wikipedia pages', () => {
  const question = 'په قرآن کریم کې تر ټولو اوږده کلمه کومه ده؟';
  const quranVerse = {
    title: 'Surah Al-Hijr 15:22 — Quran.com',
    url: 'https://quran.com/ar/al-hijr/22/translations/224',
    snippet: 'Quran text for Surah Al-Hijr 15:22 includes the exact Mushaf wording فَأَسۡقَيۡنَٰكُمُوهُ in its verse context.',
  };
  const islamweb = {
    title: 'Longest word in the Quran — IslamWeb',
    url: 'https://islamweb.net/en/printfatwa.php?id=81317',
    snippet: 'IslamWeb identifies فأسقيناكموه as the longest word in the Quran and locates it in Surah 15, verse 22.',
  };
  const wiki = {
    title: 'Quran',
    url: 'https://en.wikipedia.org/wiki/Quran',
    snippet: 'The Quran is the central religious text of Islam.',
  };

  assert.equal(isQuranLongestWordQuestion(question), true);
  assert.equal(isQuranLongestWordQuestion('What is the longest word in the Quran?'), true);
  assert.equal(isQuranLongestWordQuestion('په قرآن کې څو رکوع ګانې دي؟'), false);
  assert.equal(requiresAuthoritativeReligiousSource(question), true);
  assert.equal(isTrustedReligiousSource(quranVerse, question), true);
  assert.equal(isTrustedReligiousSource(islamweb, question), true);
  assert.equal(isTrustedReligiousSource(wiki, question), false);
  assert.deepEqual(filterTrustedReligiousSources([wiki, quranVerse, islamweb], question).map(item => item.title), [
    'Surah Al-Hijr 15:22 — Quran.com',
    'Longest word in the Quran — IslamWeb',
  ]);
});
