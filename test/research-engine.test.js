'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalResultUrl, canUseUnverifiedGeneralKnowledgeFallback } = require('../lib/research-engine');

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

test('allows a cautious general-knowledge fallback for stable topics when search evidence is missing', () => {
  assert.equal(
    canUseUnverifiedGeneralKnowledgeFallback('د سړې جګړې تاریخ څه و؟'),
    true,
  );
  assert.equal(
    canUseUnverifiedGeneralKnowledgeFallback('What is political propaganda?'),
    true,
  );
});

test('does not use a general-knowledge fallback for current updates or explicit source requests', () => {
  assert.equal(
    canUseUnverifiedGeneralKnowledgeFallback('د افغانستان تازه خبرونه څه دي؟'),
    false,
  );
  assert.equal(
    canUseUnverifiedGeneralKnowledgeFallback('د سړې جګړې سرچینې او حوالې راکړه؟'),
    false,
  );
});

