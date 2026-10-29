'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyRemoteJid, shouldHandleNotifyEvent } = require('../lib/message-router');

test('routes group and private chat identifiers separately', () => {
  assert.equal(classifyRemoteJid('120363000000000000@g.us'), 'group');
  assert.equal(classifyRemoteJid('1234567890@s.whatsapp.net'), 'private');
  assert.equal(classifyRemoteJid('123456789012345@lid'), 'private');
});

test('ignores status, channels, empty and unsupported destinations', () => {
  for (const jid of ['', null, 'status@broadcast', '123@newsletter', '123@broadcast', '123@c.us']) {
    assert.equal(classifyRemoteJid(jid), 'ignore', String(jid));
  }
});

test('only handles new notify messages from other users', () => {
  assert.equal(shouldHandleNotifyEvent('notify', { message: { conversation: 'hi' }, key: { fromMe: false } }), true);
  assert.equal(shouldHandleNotifyEvent('append', { message: { conversation: 'hi' }, key: { fromMe: false } }), false);
  assert.equal(shouldHandleNotifyEvent('notify', { message: { conversation: 'hi' }, key: { fromMe: true } }), false);
  assert.equal(shouldHandleNotifyEvent('notify', { key: { fromMe: false } }), false);
});
