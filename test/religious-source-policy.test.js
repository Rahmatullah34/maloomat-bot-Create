'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isTrustedReligiousDomain,
  isTrustedReligiousSource,
  filterTrustedReligiousSources,
  hasTrustedReligiousReferenceText,
} = require('../lib/religious-source-policy');

test('accepts established primary-text and academic reference domains', () => {
  assert.equal(isTrustedReligiousDomain('https://sunnah.com/bukhari:8'), true);
  assert.equal(isTrustedReligiousDomain('https://quran.com/2'), true);
  assert.equal(isTrustedReligiousDomain('https://www.britannica.com/topic/religion'), true);
  assert.equal(isTrustedReligiousDomain('https://www.vatican.va/'), true);
  assert.equal(isTrustedReligiousDomain('https://www.sefaria.org/'), true);
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
