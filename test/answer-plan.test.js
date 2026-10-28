'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnswerPlan, classifyQuestion, getResearchQueryHints, isDetailedQuestion } = require('../lib/answer-plan');

test('detects an explicit detailed historical question about Ahmad Shah Baba and battles', () => {
  const plan = buildAnswerPlan('د احمدشاه بابا اړوند تفصيلي ځواب؟ د هغه مشهورې جګړې؟');
  assert.equal(plan.category, 'history');
  assert.equal(plan.detailed, true);
  assert.equal(plan.historyBattleQuestion, true);
  assert.match(plan.instructions, /مقابل لوری/);
  assert.match(plan.instructions, /تاریخي روایتونه/);
});

test('classifies practical how-to questions and asks for numbered steps', () => {
  const plan = buildAnswerPlan('د WhatsApp بوټ فعالولو طریقه او لارښوونه راکړه');
  assert.equal(plan.category, 'how_to');
  assert.match(plan.instructions, /شمېرل شوو ګامونو/);
});

test('recognizes health, religion, science, translation, and current topics', () => {
  assert.equal(classifyQuestion('د شکر ناروغۍ نښې څه دي؟'), 'health');
  assert.equal(classifyQuestion('د لمانځه فرضونه کوم دي؟'), 'religion');
  assert.equal(classifyQuestion('DNA څه شی دی؟'), 'science');
  assert.equal(classifyQuestion('فیسبوک اکاونټ څنګه فعال کړم؟'), 'how_to');
  assert.equal(classifyQuestion('دا انګلیسي متن وژباړه'), 'translation');
  assert.equal(classifyQuestion('د افغانستان تازه خبرونه څه دي؟'), 'current');
});

test('classifies religious questions across Islamic and other faith topics', () => {
  for (const question of [
    'د قیامت وړې نښې کومې دي؟',
    'د رسول الله ﷺ سیرت راکړه؟',
    'د قرآن او حدیث له مخې د دې مسئلې حکم څه دی؟',
    'What does the Bible say about forgiveness?',
    'Explain the history of Judaism',
    'What is Buddhist teaching about compassion?',
    'What medicine should a Muslim use while fasting?',
  ]) {
    const plan = buildAnswerPlan(question);
    const expected = /medicine|history/i.test(question) ? ( /medicine/i.test(question) ? 'health' : 'history' ) : 'religion';
    assert.equal(plan.category, expected, question);
    if (expected === 'religion') assert.match(plan.instructions, /باوري علمي\/انسایکلویډیايي سرچینه/);
  }
});

test('does not force a detailed response for a short ordinary question', () => {
  assert.equal(isDetailedQuestion('زړه څه کوي؟'), false);
  assert.equal(buildAnswerPlan('زړه څه کوي؟').detailed, false);
  assert.equal(isDetailedQuestion('د زړه دنده په تفصیل تشریح کړه'), true);
});

test('adds reliable English research hints for Ahmad Shah Durrani battles', () => {
  const hints = getResearchQueryHints('د احمدشاه بابا مشهورې جګړې');
  assert.equal(hints.length, 2);
  assert.match(hints[0], /Ahmad Shah Durrani/);
  assert.match(hints[1], /Panipat 1761/);
});

test('generates English research queries for common Islamic questions', () => {
  const signs = getResearchQueryHints('د قیامت وړې نښې مفصل او کتابونو معلومات راکړه؟');
  assert.ok(signs.some(query => /minor signs of the Hour/i.test(query)));
  assert.ok(signs.some(query => /hadith/i.test(query)));

  const pillars = getResearchQueryHints('د اسلام پنځه بناوې څه دي؟');
  assert.ok(pillars.some(query => /Five Pillars of Islam/i.test(query)));

  const prayer = getResearchQueryHints('د لمانځه فرضونه کوم دي؟');
  assert.ok(prayer.some(query => /Salah|Islamic prayer/i.test(query)));
});

test('does not invent historical research hints for unrelated questions', () => {
  assert.deepEqual(getResearchQueryHints('سلام'), []);
});


test('keeps the main topic ahead of incidental religious words', () => {
  assert.equal(classifyQuestion('What medicine should a Muslim use while fasting?'), 'health');
  assert.equal(classifyQuestion('Explain the history of Judaism'), 'history');
  assert.equal(classifyQuestion('د الله نوم په کمپیوټر کې څنګه ولیکم؟'), 'how_to');
  assert.equal(classifyQuestion('د احمدشاه بابا مشهورې جګړې کومې وې؟'), 'history');
  assert.equal(classifyQuestion('د لمانځه فرضونه کوم دي؟'), 'religion');
});

test('generates subject-specific English research hints for beard questions', () => {
  const hints = getResearchQueryHints('د ږیرې خریل په اسلام کې څه حکم دی؟');
  assert.ok(hints.some(query => /beard/i.test(query)));
  assert.ok(hints.some(query => /Bukhari|Muslim|beards/i.test(query)));
});

test('uses book-specific source queries for the Pashto Tafsir Yaseer authorship question', () => {
  const hints = getResearchQueryHints('تفسیر یسیر پښتو کې چا لیکلی؟');
  assert.ok(hints.some(query => /Tafseer Yaseer.*author/i.test(query)));
  assert.ok(hints.some(query => /تفسیر یسیر.*مراد علي/i.test(query)));
  assert.ok(hints.every(query => !/Quran verses translation tafsir/i.test(query)));
});
