'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalResultUrl, canUseUnverifiedGeneralKnowledgeFallback, getAfghanistanDateContext } = require('../lib/research-engine');

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


test('uses the real Asia/Kabul date and Afghan Solar Hijri calendar instead of a stale model date', () => {
  const current = getAfghanistanDateContext(new Date('2026-11-05T15:07:00.000Z'));
  assert.equal(current.timeZone, 'Asia/Kabul');
  assert.equal(current.gregorianDate, '2026-11-05');
  assert.equal(current.solarHijriDate, '۱۴۰۵ عقرب ۱۴');
  assert.equal(current.localTime, '19:37');
  assert.match(current.systemInstruction, /2026-11-05/);
  assert.match(current.systemInstruction, /۱۴۰۵ عقرب ۱۴/);

  // د کارن په بېلګه کې راغلې پخوانۍ نېټه باید د ۱۴۰۴ عقرب ۲۷ په توګه وپېژندل شي،
  // خو د ۲۰۲۶ کال د نن ورځې په توګه هېڅکله ونه ښودل شي.
  const oldExample = getAfghanistanDateContext(new Date('2025-11-18T06:30:00.000Z'));
  assert.equal(oldExample.gregorianDate, '2025-11-18');
  assert.equal(oldExample.solarHijriDate, '۱۴۰۴ عقرب ۲۷');
});
