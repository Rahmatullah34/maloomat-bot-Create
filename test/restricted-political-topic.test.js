'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePoliticalTopicText,
  isRestrictedPoliticalTopic,
  isNewsOrMediaRequest,
  RESTRICTED_POLITICAL_REPLY,
} = require('../lib/restricted-political-topic');

test('recognizes Pashto and Dari references to the Taliban and Islamic Emirate', () => {
  const restrictedQuestions = [
    'طالبان څوک دي؟',
    'د طالبانو د حکومت په اړه معلومات راکړه؟',
    'د اسلامي امارت سیاسي پالیسي څه ده؟',
    'د امارت اسلامي مشر څوک دی؟',
    'د هبت الله اخندزاده په اړه معلومات راکړه؟',
    'د سراج الدین حقاني دندې څه دي؟',
    'حکومت اسلامی امارت در افغانستان چه سیاست دارد؟',
  ];
  for (const question of restrictedQuestions) {
    assert.equal(isRestrictedPoliticalTopic(question), true, question);
  }
});

test('recognizes English spellings used in political questions', () => {
  assert.equal(isRestrictedPoliticalTopic('What is the Taliban government doing?'), true);
  assert.equal(isRestrictedPoliticalTopic('Explain the Islamic Emirate of Afghanistan'), true);
  assert.equal(isRestrictedPoliticalTopic('Who is Haibatullah Akhundzada?'), true);
});

test('allows news and media-report requests about otherwise restricted political topics', () => {
  const allowedNewsRequests = [
    'د طالبانو تازه خبرونه راکړه؟',
    'د اسلامي امارت په اړه رسنۍ څه وايي؟',
    'د طالبانو د حکومت رسنیز راپورونه راکړه؟',
    'د امارت د چارواکو په اړه د خبرونو سرټکي څه دي؟',
    'طالبانو په اړه تازه راپورونه په رسنیو کې څه دي؟',
    'Latest news about the Taliban',
    'What are media reports saying about the Islamic Emirate?',
    'Find recent news articles about the Taliban government',
    'Breaking news: Taliban government announcement',
  ];
  for (const question of allowedNewsRequests) {
    assert.equal(isNewsOrMediaRequest(question), true, question);
    assert.equal(isRestrictedPoliticalTopic(question), false, question);
  }
});

test('continues to restrict direct political explanations even when news terms are absent', () => {
  const blockedQuestions = [
    'طالبان څوک دي؟',
    'د طالبانو سیاسي پالیسي څه ده؟',
    'د اسلامي امارت د مشر په اړه معلومات راکړه؟',
    'Explain the Taliban government structure',
  ];
  for (const question of blockedQuestions) {
    assert.equal(isRestrictedPoliticalTopic(question), true, question);
  }
});

test('does not block unrelated religious, science, or school questions', () => {
  const allowedQuestions = [
    'د اسلام پنځه بناوې څه دي؟',
    'د زړه دنده څه ده؟',
    'طالب علم څه معنا لري؟',
    'اسلامي تاریخ څه ته وایي؟',
    'د افغانستان غرونه کوم دي؟',
  ];
  for (const question of allowedQuestions) {
    assert.equal(isRestrictedPoliticalTopic(question), false, question);
  }
});

test('normalizes Arabic-script letter variants and spacing', () => {
  assert.equal(
    normalizePoliticalTopicText('امارت اسلامی'),
    normalizePoliticalTopicText('امارت اسلامي'),
  );
  assert.equal(isRestrictedPoliticalTopic('ا م ا ر ت اسلامي'), false);
});

test('uses a short, polite response with no political explanation', () => {
  assert.match(RESTRICTED_POLITICAL_REPLY, /بښنه غواړم/);
  assert.match(RESTRICTED_POLITICAL_REPLY, /معلومات فعلاً زموږ په خدمت کې نشته/);
});
