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
  assert.ok(topics.every((topic) => ['علم', 'تاریخ', 'ټکنالوژي', 'اسلامي معلومات', 'روغتیا', 'عمومي معلومات'].includes(topic)));
  assert.equal(getTopicForSlot('2026-10-27', '08:00'), getTopicForSlot('2026-10-27', '08:00'));
});

test('validates group and channel IDs without accepting arbitrary chats', () => {
  assert.equal(isValidGroupJid('123456789-123456@g.us'), true);
  assert.equal(isValidGroupJid('123456789@s.whatsapp.net'), false);
  assert.equal(isValidGroupJid('123@newsletter'), false);
  assert.equal(isValidChannelJid('120363123456789012@newsletter'), true);
  assert.equal(isValidChannelJid('123456789-123456@g.us'), false);
});

test('post formatting is natural and avoids decorative or repeated boilerplate', () => {
  const text = formatPost(
    { title: 'ازمایښتي سرلیک', body: 'ازمایښتي متن', topic: 'علم', source: 'https://example.org' },
    { key: '08:00' },
  );
  assert.match(text, /^\*ازمایښتي سرلیک\*/);
  assert.match(text, /ازمایښتي متن/);
  assert.match(text, /سرچینه: https:\/\/example\.org/);
  assert.doesNotMatch(text, /Maloomat AI|موضوع:|08:00|📚|📌|🌟|💡|د زده کړې پیغام/);

  const expanded = formatPost({
    title: 'اسلامي ازمایښتي سرلیک',
    body: 'اصلي معلومات',
    details: 'نور وضاحت',
    takeaway: 'دا د اصلي معلوماتو تکرار دی',
    topic: 'اسلامي معلومات',
    source: 'https://example.org/quran',
  }, { key: '19:00' });
  assert.match(expanded, /نور وضاحت/);
  assert.match(expanded, /سرچینه: https:\/\/example\.org\/quran/);
  assert.doesNotMatch(expanded, /دا د اصلي معلوماتو تکرار دی|د زده کړې پیغام|موضوع:|19:00/);
});

test('content selection never repeats and falls back to another unused topic', () => {
  const state = {
    recentContentIds: [],
    publishedContentIds: [],
    publishedContentKeys: [],
    contentCursor: 0,
  };

  const first = selectNextPost(state, 'علم');
  assert.equal(first.topic, 'علم');
  assert.equal(state.publishedContentIds.includes(first.id), true);

  const second = selectNextPost(state, 'تاریخ');
  assert.equal(second.topic, 'تاریخ');
  assert.notEqual(second.id, first.id);

  const seen = new Set([first.id, second.id]);
  let next;
  while ((next = selectNextPost(state, 'علم'))) {
    assert.equal(seen.has(next.id), false, 'a published post must never be selected again');
    seen.add(next.id);
  }

  assert.equal(seen.size, CONTENT_COUNT);
  assert.equal(state.publishedContentIds.length, CONTENT_COUNT);
  assert.equal(selectNextPost(state, 'تاریخ'), null);
  assert.ok(CONTENT_COUNT >= 30);
});
