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
  readOpenRouterApiKey,
  readWhatsAppPhone,
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

test('loads group, internet search, AI and moderation settings without private chat configuration', () => {
  const config = loadRuntimeConfig({
    ENABLE_GROUP_QA: 'false',
    ENABLE_INTERNET_SEARCH: 'off',
    ENABLE_AI_SUMMARIZATION: '1',
    ENABLE_LINK_MODERATION: 'yes',
    WARNING_MUTE_DURATION_MINUTES: '1800',
    AI_MAX_OUTPUT_TOKENS: '2600',
    SERVER_PORT: '8088',
    FULL_MODERATION_EXEMPT_PHONE_NUMBER: '+1 (202) 555-0100',
  });

  assert.equal(config.features.groupQA, false);
  assert.equal(config.features.privateQA, undefined);
  assert.equal(config.features.internetSearch, false);
  assert.equal(config.features.aiSummarization, true);
  assert.equal(config.features.linkModeration, true);
  assert.equal(config.warningMute.durationMinutes, 1440);
  assert.equal(config.ai.maxOutputTokens, 2600);
  assert.equal(config.serverPort, 8088);
  assert.deepEqual(Object.keys(config.security), ['fullModerationExemptPhoneNumber']);
  assert.equal(config.security.fullModerationExemptPhoneNumber, '12025550100');
});

test('does not embed personal phone or LID allowlists in runtime config', () => {
  const config = loadRuntimeConfig({});
  assert.equal(config.security.privateQaAllowedNumbers, undefined);
  assert.equal(config.security.privateQaAllowedLids, undefined);
  assert.equal(config.security.privateFullServicesAllowedNumbers, undefined);
  assert.equal(config.features.privateQA, undefined);
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

test('normalizes the WhatsApp pairing phone and preserves the local-file fallback', () => {
  assert.equal(readWhatsAppPhone({ WHATSAPP_PHONE: '+1 (202) 555-0100' }, '/missing'), '12025550100');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maloomat-phone-'));
  try {
    fs.writeFileSync(path.join(dir, 'whatsapp-phone.txt'), '+44 1234 567890\n', 'utf8');
    assert.equal(readWhatsAppPhone({}, dir), '441234567890');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
