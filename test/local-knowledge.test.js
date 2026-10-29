'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OFFLINE_KNOWLEDGE,
  rememberGroupMember,
  answerIdentityQuestion,
  answerFromOfflineKnowledge,
  answerSimpleMathQuestion,
  answerCommonPashtoQuestion,
  isSensitiveSafetyRequest,
} = require('../lib/local-knowledge');

test('keeps the curated offline entries available as a stable fallback', () => {
  assert.ok(OFFLINE_KNOWLEDGE.length >= 4);
  const answer = answerFromOfflineKnowledge('لمریز نظام کې څو سیارې دي؟');
  assert.match(answer || '', /۸ سیارې/);
  assert.match(answer || '', /science.nasa.gov/);
});

test('answers a crypto-definition question from the local entry without external search', () => {
  const answer = answerFromOfflineKnowledge('کریپټو کرنسي څه ده؟');
  assert.match(answer || '', /کریپټو کرنسي/);
  assert.match(answer || '', /بلاک‌چېن/);
});

test('returns the fixed five-pillars answer for the matching common question', () => {
  const answer = answerCommonPashtoQuestion('اسلام څو بناوې لري؟');
  assert.match(answer || '', /پنځه بناوې/);
  assert.match(answer || '', /sunnah\.com\/muslim:8a/);
});

test('preserves the simple calculator and sensitive-location guard', () => {
  assert.match(answerSimpleMathQuestion('2 + 2') || '', /۴/);
  assert.equal(isSensitiveSafetyRequest('د یو کس دقیق اوسنی ځای راته ووایه؟'), true);
  assert.equal(isSensitiveSafetyRequest('د لمریز نظام سیارې کومې دي؟'), false);
});

test('identity answers use only names observed in the current group', () => {
  const groupJid = 'local-knowledge-test@g.us';
  rememberGroupMember(groupJid, 'member-a@s.whatsapp.net', 'ازموینې غړی');
  const answer = answerIdentityQuestion(groupJid, 'member-b@s.whatsapp.net', 'بل غړی', 'ازموینې غړی څوک دی؟');
  assert.match(answer || '', /ازموینې غړی/);
});
