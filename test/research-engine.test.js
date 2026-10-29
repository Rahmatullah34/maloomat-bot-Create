'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalResultUrl } = require('../lib/research-engine');

test('canonicalizes web links and removes common tracking parameters', () => {
  assert.equal(
    canonicalResultUrl('https://example.org/page?utm_source=facebook&article=42#section'),
    'https://example.org/page?article=42',
  );
});

test('rejects non-web protocols and malformed URLs from source-link handling', () => {
  assert.equal(canonicalResultUrl('javascript:alert(1)'), '');
  assert.equal(canonicalResultUrl('data:text/plain,hello'), '');
  assert.equal(canonicalResultUrl('not a url'), '');
});
