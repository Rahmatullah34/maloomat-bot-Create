'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePoliticalTopicText,
  isRestrictedPoliticalTopic,
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
