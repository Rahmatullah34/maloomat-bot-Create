'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONTENT_COUNT,
  formatPost,
  getDueSlot,
  getKabulTimeParts,
  getTopicForSlot,
  isValidChannelJid,
  isValidGroupJid,
  selectNextPost,
} = require('../lib/auto-publisher');

test('uses Afghanistan local time for schedule calculations', () => {
  const parts = getKabulTimeParts(new Date('2026-10-27T03:30:00.000Z'));
  assert.equal(parts.dateKey, '2026-10-27');
  assert.equal(parts.hour, 8);
  assert.equal(parts.minute, 0);
});

test('recognizes a scheduled slot only within its short grace window', () => {
  assert.equal(getDueSlot(new Date('2026-10-27T03:34:00.000Z')).key, '08:00');
  assert.equal(getDueSlot(new Date('2026-10-27T03:39:00.000Z')).key, '08:00');
  assert.equal(getDueSlot(new Date('2026-10-27T03:40:00.000Z')), null);
  assert.equal(getDueSlot(new Date('2026-10-27T05:00:00.000Z')), null);
});

test('daily topic rotation is deterministic and covers configured subjects', () => {
  const topics = [
    getTopicForSlot('2026-10-27', '08:00'),
    getTopicForSlot('2026-10-27', '13:00'),
    getTopicForSlot('2026-10-27', '19:00'),
  ];
  assert.equal(topics.length, 3);
  assert.ok(topics.every((topic) => ['علم', 'تاریخ', 'ټکنالوژي', 'روغتیا', 'عمومي معلومات'].includes(topic)));
  assert.equal(getTopicForSlot('2026-10-27', '08:00'), getTopicForSlot('2026-10-27', '08:00'));
});

test('validates group and channel IDs without accepting arbitrary chats', () => {
  assert.equal(isValidGroupJid('123456789-123456@g.us'), true);
  assert.equal(isValidGroupJid('123456789@s.whatsapp.net'), false);
  assert.equal(isValidGroupJid('123@newsletter'), false);
  assert.equal(isValidChannelJid('120363123456789012@newsletter'), true);
  assert.equal(isValidChannelJid('123456789-123456@g.us'), false);
});

test('post formatting includes title, topic, source and Afghanistan time', () => {
  const text = formatPost(
    { title: 'ازمایښتي سرلیک', body: 'ازمایښتي متن', topic: 'علم', source: 'https://example.org' },
    { key: '08:00' },
  );
  assert.match(text, /ازمایښتي سرلیک/);
  assert.match(text, /موضوع: علم/);
  assert.match(text, /https:\/\/example\.org/);
  assert.match(text, /08:00/);
});

test('content selection chooses from the requested topic and tracks recent IDs', () => {
  const state = { recentContentIds: [], contentCursor: 0 };
  const first = selectNextPost(state, 'علم');
  assert.equal(first.topic, 'علم');
  assert.equal(state.recentContentIds.includes(first.id), true);
  const second = selectNextPost(state, 'تاریخ');
  assert.equal(second.topic, 'تاریخ');
  assert.notEqual(second.id, first.id);
  assert.ok(CONTENT_COUNT >= 18);
});
