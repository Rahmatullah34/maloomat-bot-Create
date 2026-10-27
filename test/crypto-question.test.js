'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isCryptoEducationQuestion } = require('../lib/crypto-question');

test('recognizes Pashto crypto definitions with varied spellings and extra instructions', () => {
  assert.equal(isCryptoEducationQuestion('کریپټو کرنسي څه ده؟ تفصیلي ځواب راکړه؟'), true);
  assert.equal(isCryptoEducationQuestion('کریپټوکرنسي څه ده؟'), true);
  assert.equal(isCryptoEducationQuestion('کريپټو کرنسۍ په اړه معلومات راکړه؟'), true);
  assert.equal(isCryptoEducationQuestion('What is cryptocurrency?'), true);
});

test('does not use the static explanation for current crypto prices', () => {
  assert.equal(isCryptoEducationQuestion('کریپټو کرنسي قیمت نن څو دی؟'), false);
  assert.equal(isCryptoEducationQuestion('What is the current crypto price?'), false);
});

test('does not match unrelated questions', () => {
  assert.equal(isCryptoEducationQuestion('بلاکچېن څه شی دی؟'), false);
  assert.equal(isCryptoEducationQuestion('سلام علیکم؟'), false);
});
