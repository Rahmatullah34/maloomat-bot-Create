'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  readPrivateRuntimeConfig,
  getPrivateRuntimeValue,
  loadRuntimeEnvironment,
} = require('../lib/private-runtime-config');

function makeConfigDirectory(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maloomat-private-config-'));
  if (content !== undefined) {
    fs.writeFileSync(path.join(dir, 'private-runtime-config.json'), content, 'utf8');
  }
  return dir;
}

test('reads only supported private settings from the server-side JSON file', () => {
  const dir = makeConfigDirectory(JSON.stringify({
    PRIVATE_QA_ALLOWED_NUMBERS: '15551234567',
    FULL_MODERATION_EXEMPT_PHONE_NUMBER: '15557654321',
    ALLOWED_LINK_SENDERS: '15551234567,15557654321',
    PRIVATE_QA_ALLOWED_LIDS: '123456789012345@lid',
    UNRECOGNIZED_SETTING: 'must-not-be-loaded',
  }));

  try {
    assert.deepEqual(readPrivateRuntimeConfig(dir), {
      PRIVATE_QA_ALLOWED_NUMBERS: '15551234567',
      FULL_MODERATION_EXEMPT_PHONE_NUMBER: '15557654321',
      ALLOWED_LINK_SENDERS: '15551234567,15557654321',
      PRIVATE_QA_ALLOWED_LIDS: '123456789012345@lid',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('non-empty environment values override the private file and blank values fall back to it', () => {
  const dir = makeConfigDirectory(JSON.stringify({
    PRIVATE_QA_ALLOWED_NUMBERS: '15551234567',
    ALLOWED_LINK_SENDERS: '15557654321',
  }));

  try {
    assert.equal(
      getPrivateRuntimeValue('PRIVATE_QA_ALLOWED_NUMBERS', {
        PRIVATE_QA_ALLOWED_NUMBERS: '  ',
      }, dir),
      '15551234567'
    );
    assert.equal(
      getPrivateRuntimeValue('ALLOWED_LINK_SENDERS', {
        ALLOWED_LINK_SENDERS: '15550001111',
      }, dir),
      '15550001111'
    );
    assert.equal(
      loadRuntimeEnvironment({
        PRIVATE_QA_ALLOWED_NUMBERS: '',
        PORT: '5000',
      }, dir).PRIVATE_QA_ALLOWED_NUMBERS,
      '15551234567'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('missing or invalid private configuration fails closed without throwing', () => {
  const missingDir = makeConfigDirectory();
  const invalidDir = makeConfigDirectory('{not-json');

  try {
    assert.deepEqual(readPrivateRuntimeConfig(missingDir), {});
    assert.deepEqual(readPrivateRuntimeConfig(invalidDir), {});
    assert.equal(getPrivateRuntimeValue('FULL_MODERATION_EXEMPT_PHONE_NUMBER', {}, missingDir), '');
  } finally {
    fs.rmSync(missingDir, { recursive: true, force: true });
    fs.rmSync(invalidDir, { recursive: true, force: true });
  }
});
