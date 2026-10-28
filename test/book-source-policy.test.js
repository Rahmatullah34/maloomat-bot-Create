'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isTafsirYaseerAuthorshipQuestion,
  isTafsirYaseerAuthorSource,
  filterTafsirYaseerAuthorSources,
} = require('../lib/book-source-policy');

test('recognizes Pashto and English questions asking who wrote Tafsir Yaseer', () => {
  assert.equal(isTafsirYaseerAuthorshipQuestion('تفسیر یسیر پښتو کې چا لیکلی؟'), true);
  assert.equal(isTafsirYaseerAuthorshipQuestion('Who wrote Tafseer Yaseer in Pashto?'), true);
  assert.equal(isTafsirYaseerAuthorshipQuestion('د قرآن عمومي معلومات راکړه'), false);
  assert.equal(isTafsirYaseerAuthorshipQuestion('تفسیر یسیر څه ډول کتاب دی؟'), false);
});

test('accepts only a source that mentions both the named work and attribution', () => {
  const direct = {
    title: 'تفسير یسیر مشهوره په فوق الیسیر',
    url: 'https://pashtonlegacylibrarykandahar.com/books1/3974',
    snippet: 'د کتاب معلومات. لیکوال: مولوي مراد علي. د تفسیر یسیر په اړه د کتاب لنډیز او پېژندنه.',
  };
  const generic = {
    title: 'Quran',
    url: 'https://en.wikipedia.org/wiki/Quran',
    snippet: 'The Quran is the central religious text of Islam.',
  };
  const authorOnly = {
    title: 'مولوي مراد علي',
    url: 'https://example.org/murad-ali',
    snippet: 'A biography of a Pashto writer, with no mention of Tafsir Yaseer.',
  };

  assert.equal(isTafsirYaseerAuthorSource(direct), true);
  assert.equal(isTafsirYaseerAuthorSource(generic), false);
  assert.equal(isTafsirYaseerAuthorSource(authorOnly), false);
  assert.deepEqual(filterTafsirYaseerAuthorSources([generic, direct, authorOnly]), [direct]);
});
