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
    FULL_MODERATION_EXEMPT_PHONE_NUMBERS: '15551230001,15551230002',
    ALLOWED_LINK_SENDERS: '15551234567,15557654321',
    PRIVATE_QA_ALLOWED_LIDS: '123456789012345@lid',
    CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
    CLOUDFLARE_API_TOKEN: 'test-cloudflare-token',
    OPENROUTER_API_KEY: 'test-openrouter-token',
    ELEVENLABS_API_KEY: 'test-elevenlabs-token',
    ELEVENLABS_VOICE_ID: 'test-pashto-male-voice',
    ELEVENLABS_TTS_ENABLED: 'true',
    ELEVENLABS_TTS_MODEL: 'eleven_v3',
    ENGLISH_COURSE_AUDIO_PAUSED: 'true',
    GROUP_REJOIN_APPROVER_PHONE: '0707285093',
    AI_PROVIDER: 'cloudflare',
    CLOUDFLARE_AI_TEXT_MODEL: '@cf/zai-org/glm-4.7-flash',
    UNRECOGNIZED_SETTING: 'must-not-be-loaded',
  }));

  try {
    assert.deepEqual(readPrivateRuntimeConfig(dir), {
      PRIVATE_QA_ALLOWED_NUMBERS: '15551234567',
      FULL_MODERATION_EXEMPT_PHONE_NUMBER: '15557654321',
      FULL_MODERATION_EXEMPT_PHONE_NUMBERS: '15551230001,15551230002',
      ALLOWED_LINK_SENDERS: '15551234567,15557654321',
      PRIVATE_QA_ALLOWED_LIDS: '123456789012345@lid',
      CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
      CLOUDFLARE_API_TOKEN: 'test-cloudflare-token',
      OPENROUTER_API_KEY: 'test-openrouter-token',
      ELEVENLABS_API_KEY: 'test-elevenlabs-token',
      ELEVENLABS_VOICE_ID: 'test-pashto-male-voice',
      ELEVENLABS_TTS_ENABLED: 'true',
      ELEVENLABS_TTS_MODEL: 'eleven_v3',
      ENGLISH_COURSE_AUDIO_PAUSED: 'true',
      GROUP_REJOIN_APPROVER_PHONE: '0707285093',
      AI_PROVIDER: 'cloudflare',
      CLOUDFLARE_AI_TEXT_MODEL: '@cf/zai-org/glm-4.7-flash',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('non-empty environment values override the private file and blank values fall back to it', () => {
  const dir = makeConfigDirectory(JSON.stringify({
    PRIVATE_QA_ALLOWED_NUMBERS: '15551234567',
    ALLOWED_LINK_SENDERS: '15557654321',
    OPENROUTER_API_KEY: 'private-openrouter-key',
    ELEVENLABS_API_KEY: 'private-elevenlabs-key',
    ELEVENLABS_TTS_ENABLED: 'true',
    ENGLISH_COURSE_AUDIO_PAUSED: 'true',
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
    assert.equal(getPrivateRuntimeValue('OPENROUTER_API_KEY', {}, dir), 'private-openrouter-key');
    assert.equal(getPrivateRuntimeValue('ELEVENLABS_API_KEY', {}, dir), 'private-elevenlabs-key');
    assert.equal(getPrivateRuntimeValue('ELEVENLABS_TTS_ENABLED', {}, dir), 'true');
    assert.equal(getPrivateRuntimeValue('ENGLISH_COURSE_AUDIO_PAUSED', {}, dir), 'true');
    assert.equal(
      getPrivateRuntimeValue('ENGLISH_COURSE_AUDIO_PAUSED', {
        ENGLISH_COURSE_AUDIO_PAUSED: 'false',
      }, dir),
      'false'
    );
    assert.equal(
      getPrivateRuntimeValue('ELEVENLABS_API_KEY', { ELEVENLABS_API_KEY: 'environment-elevenlabs-key' }, dir),
      'environment-elevenlabs-key'
    );
    assert.equal(
      getPrivateRuntimeValue('OPENROUTER_API_KEY', { OPENROUTER_API_KEY: 'environment-openrouter-key' }, dir),
      'environment-openrouter-key'
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

test('loads Cloudflare credentials from the private server file and lets environment values override them', () => {
  const dir = makeConfigDirectory(JSON.stringify({
    CLOUDFLARE_ACCOUNT_ID: 'private-account-id',
    CLOUDFLARE_API_TOKEN: 'private-token',
  }));

  try {
    const loaded = loadRuntimeEnvironment({
      CLOUDFLARE_ACCOUNT_ID: '',
      CLOUDFLARE_API_TOKEN: '',
    }, dir);
    assert.equal(loaded.CLOUDFLARE_ACCOUNT_ID, 'private-account-id');
    assert.equal(loaded.CLOUDFLARE_API_TOKEN, 'private-token');

    const overridden = loadRuntimeEnvironment({
      CLOUDFLARE_ACCOUNT_ID: 'environment-account-id',
      CLOUDFLARE_API_TOKEN: 'environment-token',
    }, dir);
    assert.equal(overridden.CLOUDFLARE_ACCOUNT_ID, 'environment-account-id');
    assert.equal(overridden.CLOUDFLARE_API_TOKEN, 'environment-token');
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
