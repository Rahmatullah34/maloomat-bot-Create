'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  loadRuntimeConfig,
  parseBoolean,
  parseBoundedInteger,
  normalizePhoneNumber,
  normalizeLid,
  readOpenRouterApiKey,
} = require('../lib/runtime-config');

test('parses common boolean forms and uses the fallback for invalid values', () => {
  assert.equal(parseBoolean('true', false), true);
  assert.equal(parseBoolean('ON', false), true);
  assert.equal(parseBoolean('false', true), false);
  assert.equal(parseBoolean(undefined, true), true);
  assert.equal(parseBoolean('perhaps', true), true);
});

test('bounds integer configuration instead of accepting invalid or unsafe values', () => {
  assert.equal(parseBoundedInteger('8080', 5000, 1, 65535), 8080);
  assert.equal(parseBoundedInteger('70000', 5000, 1, 65535), 65535);
  assert.equal(parseBoundedInteger('0', 5000, 1, 65535), 5000);
  assert.equal(parseBoundedInteger('not-a-number', 120, 1, 1440), 120);
});

test('loads feature flags, bounded limits, and private allowlists from environment values', () => {
  const config = loadRuntimeConfig({
    ENABLE_GROUP_QA: 'false',
    ENABLE_PRIVATE_QA: 'true',
    ENABLE_INTERNET_SEARCH: 'off',
    ENABLE_AI_SUMMARIZATION: '1',
    ENABLE_LINK_MODERATION: 'yes',
    WARNING_MUTE_DURATION_MINUTES: '1800',
    AI_MAX_OUTPUT_TOKENS: '2600',
    SERVER_PORT: '8088',
    PRIVATE_QA_ALLOWED_NUMBERS: '+1 (202) 555-0100, 0044123456789, bad',
    PRIVATE_QA_ALLOWED_LIDS: '123456789012345, 998877665544332@lid',
    FULL_MODERATION_EXEMPT_PHONE_NUMBER: '+1 (202) 555-0100',
  });

  assert.equal(config.features.groupQA, false);
  assert.equal(config.features.privateQA, true);
  assert.equal(config.features.internetSearch, false);
  assert.equal(config.features.aiSummarization, true);
  assert.equal(config.features.linkModeration, true);
  assert.equal(config.warningMute.durationMinutes, 1440);
  assert.equal(config.ai.maxOutputTokens, 2600);
  assert.equal(config.serverPort, 8088);
  assert.deepEqual([...config.security.privateQaAllowedNumbers], ['12025550100', '0044123456789']);
  assert.deepEqual([...config.security.privateQaAllowedLids], ['123456789012345', '998877665544332']);
  assert.equal(config.security.fullModerationExemptPhoneNumber, '12025550100');
});

test('uses the environment API key first and can read a locally ignored key file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maloomat-config-'));
  try {
    fs.writeFileSync(path.join(dir, 'OPENROUTER_API_KEY'), ' local-secret\n', 'utf8');
    assert.equal(readOpenRouterApiKey({ OPENROUTER_API_KEY: ' env-secret ' }, dir), 'env-secret');
    assert.equal(readOpenRouterApiKey({}, dir), 'local-secret');
    assert.equal(readOpenRouterApiKey({}, path.join(dir, 'missing')), '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('does not embed a private phone or LID allowlist in the runtime defaults', () => {
  const config = loadRuntimeConfig({});
  assert.equal(config.security.privateQaAllowedNumbers.size, 0);
  assert.equal(config.security.privateQaAllowedLids.size, 0);
  assert.equal(config.security.fullModerationExemptPhoneNumber, '');
});
