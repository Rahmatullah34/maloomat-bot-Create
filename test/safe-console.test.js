'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  installSensitiveLogRedaction,
  REDACTED_SESSION_LOG,
} = require('../lib/safe-console');

function makeConsole() {
  const output = [];
  const target = {};
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace']) {
    target[method] = (...args) => output.push({ method, args });
  }
  return { target, output };
}

test('redacts WhatsApp Signal session objects instead of printing key material', () => {
  const { target, output } = makeConsole();
  installSensitiveLogRedaction(target);
  target.log('Closing session: SessionEntry', {
    _chains: { abc: { chainKey: { key: 'chain-secret' } } },
    registrationId: 123,
    currentRatchet: {
      ephemeralKeyPair: { pubKey: 'public-value', privKey: 'private-value' },
      rootKey: 'root-secret',
    },
    indexInfo: { remoteIdentityKey: 'identity-secret' },
  });

  assert.equal(output.length, 1);
  assert.deepEqual(output[0].args, [REDACTED_SESSION_LOG]);
  assert.doesNotMatch(JSON.stringify(output), /private-value|root-secret|chain-secret|identity-secret/);
});

test('does not alter ordinary application logs', () => {
  const { target, output } = makeConsole();
  installSensitiveLogRedaction(target);
  target.log('✅ د بوټ د روغتیا HTTP خدمت فعال شو.');
  target.warn('د سرچینې ځواب ونه موندل شو.');

  assert.equal(output.length, 2);
  assert.match(output[0].args[0], /روغتیا HTTP خدمت فعال شو/);
  assert.match(output[1].args[0], /سرچینې ځواب ونه موندل شو/);
});

test('redacts a fully formatted session-entry string too', () => {
  const { target, output } = makeConsole();
  installSensitiveLogRedaction(target);
  target.error('Closing session: SessionEntry { currentRatchet: { rootKey: <Buffer secret> } }');

  assert.deepEqual(output[0].args, [REDACTED_SESSION_LOG]);
});
