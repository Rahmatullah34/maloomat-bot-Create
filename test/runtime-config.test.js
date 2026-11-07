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
  readCloudflareApiToken,
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

test('loads feature flags, bounded limits, and private allowlists from environment values', () => {
  const config = loadRuntimeConfig({
    ENABLE_GROUP_QA: 'false',
    ENABLE_PRIVATE_QA: 'true',
    ENABLE_INTERNET_SEARCH: 'off',
    ENABLE_AI_SUMMARIZATION: '1',
    ENABLE_LINK_MODERATION: 'yes',
    WARNING_MUTE_DURATION_MINUTES: '1800',
    AI_MAX_OUTPUT_TOKENS: '2600',
    OPENROUTER_VISION_MODEL: 'google/gemma-4-26b-a4b-it:free',
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
  assert.equal(config.ai.visionModel, 'google/gemma-4-26b-a4b-it:free');
  assert.equal(config.serverPort, 8088);
  assert.deepEqual([...config.security.privateQaAllowedNumbers], ['12025550100', '0044123456789']);
  assert.deepEqual([...config.security.privateQaAllowedLids], ['123456789012345', '998877665544332']);
  assert.equal(config.security.fullModerationExemptPhoneNumber, '12025550100');
});

test('loads the free creative model and optional Cloudflare image settings', () => {
  const config = loadRuntimeConfig({
    OPENROUTER_CREATIVE_MODEL: 'openrouter/free',
    CLOUDFLARE_ACCOUNT_ID: 'example-account',
    CLOUDFLARE_IMAGE_MODEL: '@cf/black-forest-labs/flux-1-schnell',
  });
  assert.equal(config.ai.creativeModel, 'openrouter/free');
  assert.equal(config.image.cloudflareAccountId, 'example-account');
  assert.equal(config.image.cloudflareModel, '@cf/black-forest-labs/flux-1-schnell');
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

test('uses a free image-capable model by default when no vision model is configured', () => {
  assert.equal(loadRuntimeConfig({}).ai.visionModel, 'openrouter/free');
});

test('does not embed a private phone or LID allowlist in the runtime defaults', () => {
  const config = loadRuntimeConfig({});
  assert.equal(config.security.privateQaAllowedNumbers.size, 0);
  assert.equal(config.security.privateQaAllowedLids.size, 0);
  assert.equal(config.security.fullModerationExemptPhoneNumber, '');
});

test('loads private security settings from the server-side JSON fallback', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maloomat-private-runtime-'));
  try {
    fs.writeFileSync(path.join(dir, 'private-runtime-config.json'), JSON.stringify({
      PRIVATE_QA_ALLOWED_NUMBERS: '15551234567, 441234567890',
      PRIVATE_QA_ALLOWED_LIDS: '123456789012345@lid',
      FULL_MODERATION_EXEMPT_PHONE_NUMBER: '+1 (555) 765-4321',
    }), 'utf8');

    const config = loadRuntimeConfig(undefined, dir);
    assert.deepEqual([...config.security.privateQaAllowedNumbers], ['15551234567', '441234567890']);
    assert.deepEqual([...config.security.privateQaAllowedLids], ['123456789012345']);
    assert.equal(config.security.fullModerationExemptPhoneNumber, '15557654321');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('reads the Cloudflare API token from the process environment without persisting it in config', () => {
  assert.equal(readCloudflareApiToken({ CLOUDFLARE_API_TOKEN: ' cloudflare-secret ' }), 'cloudflare-secret');
  assert.equal(readCloudflareApiToken({}), '');
});
