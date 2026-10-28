'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  answerReligiousKnowledge,
  isMinorSignsQuestion,
  normalizeReligiousQuestion,
} = require('../lib/religious-knowledge');

test('recognizes a detailed Pashto question about the minor signs of the Hour', () => {
  const question = 'دقیامت وړې نښې مفصل او کتابونو معلومات راکړه؟';
  assert.equal(isMinorSignsQuestion(question), true);
  const answer = answerReligiousKnowledge(question);
  assert.ok(answer);
  assert.match(answer, /د قیامت وړې نښې/);
  assert.match(answer, /صحیح البخاري/);
  assert.match(answer, /صحیح مسلم/);
});

test('answers a general question about the signs of the Hour when it does not ask for major signs', () => {
  assert.equal(isMinorSignsQuestion('د قیامت نښې کومې دي؟'), true);
  assert.ok(answerReligiousKnowledge('د قیامت نښې کومې دي؟'));
});

test('does not confuse a major-signs question with a minor-signs answer', () => {
  assert.equal(isMinorSignsQuestion('د قیامت لویې نښې مفصلې راته بیان کړه'), false);
  assert.equal(answerReligiousKnowledge('د قیامت لویې نښې مفصلې راته بیان کړه'), null);
});

test('does not answer unrelated religious or ordinary questions', () => {
  assert.equal(answerReligiousKnowledge('د لمانځه فرضونه څو دي؟'), null);
  assert.equal(answerReligiousKnowledge('سلامونه او نېکې هیلې'), null);
  assert.equal(isMinorSignsQuestion(''), false);
});

test('normalizes Arabic and Pashto spelling variants', () => {
  assert.equal(normalizeReligiousQuestion('أشراط الساعة الصغرى'), 'اشراط الساعه الصغرى');
  assert.equal(isMinorSignsQuestion('أشراط الساعة الصغرى'), true);
});

test('includes direct hadith references for every named example', () => {
  const answer = answerReligiousKnowledge('د قیامت وړې نښې');
  for (const url of [
    'https://sunnah.com/bukhari:3176',
    'https://sunnah.com/bukhari:5231',
    'https://sunnah.com/bukhari:1036',
    'https://sunnah.com/muslim:8a',
    'https://sunnah.com/muslim:157m',
    'https://sunnah.com/bukhari:7121',
  ]) {
    assert.ok(answer.includes(url), 'missing reference ' + url);
  }
});
