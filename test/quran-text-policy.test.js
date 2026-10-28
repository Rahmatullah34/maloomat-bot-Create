'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  QURAN_LONGEST_WORD_UTHMANI,
  buildVerifiedQuranLongestWordAnswer,
} = require('../lib/quran-text-policy');

test('returns a fixed Quran longest-word answer with a source-preserved Uthmani spelling', () => {
  const answer = buildVerifiedQuranLongestWordAnswer('په قرآن کریم کې تر ټولو اوږده کلمه کومه ده؟');
  assert.ok(answer);
  assert.ok(answer.includes(QURAN_LONGEST_WORD_UTHMANI));
  assert.equal(QURAN_LONGEST_WORD_UTHMANI, 'فَأَسۡقَيۡنَٰكُمُوهُ');
  assert.match(answer, /quran\.com/iu);
  assert.match(answer, /islamweb\.net/iu);
  assert.doesNotMatch(answer, /wikipedia\.org/iu);
});

test('does not override unrelated Quran questions', () => {
  assert.equal(buildVerifiedQuranLongestWordAnswer('قرآن کریم څو رکوع ګانې لري؟'), null);
  assert.equal(buildVerifiedQuranLongestWordAnswer('د قرآن د آیت تفسیر څه دی؟'), null);
});
