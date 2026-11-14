'use strict';

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnvironment, getPrivateRuntimeValue } = require('./private-runtime-config');

const FALSE_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled']);
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (FALSE_VALUES.has(normalized)) return false;
  if (TRUE_VALUES.has(normalized)) return true;
  return fallback;
}

function parseBoundedInteger(value, fallback, min, max) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return fallback;
  if (parsed < min) return fallback;
  return Math.min(max, parsed);
}

function normalizePhoneNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeLid(value) {
  const withoutDomain = String(value || '').trim().replace(/@lid$/iu, '');
  return withoutDomain.split(':')[0].replace(/\D/g, '');
}

function parsePhoneAllowlist(value) {
  const entries = String(value || '').split(',');
  return new Set(entries.map(normalizePhoneNumber).filter(number => number.length >= 7));
}

function parseLidAllowlist(value) {
  const entries = String(value || '').split(',');
  return new Set(entries.map(normalizeLid).filter(id => id.length >= 5));
}

function readWhatsAppPhone(env = process.env, baseDir = process.cwd()) {
  const configured = normalizePhoneNumber(env?.WHATSAPP_PHONE);
  if (configured) return configured;

  try {
    return normalizePhoneNumber(fs.readFileSync(path.resolve(baseDir, 'whatsapp-phone.txt'), 'utf8'));
  } catch {
    return '';
  }
}

function readOpenRouterApiKey(env = process.env, baseDir = process.cwd()) {
  const configuredKey = String(getPrivateRuntimeValue('OPENROUTER_API_KEY', env, baseDir) || '').trim();
  if (configuredKey) return configuredKey;

  try {
    return fs.readFileSync(path.resolve(baseDir, 'OPENROUTER_API_KEY'), 'utf8').trim();
  } catch {
    return '';
  }
}


function readCloudflareApiToken(env = process.env, baseDir = process.cwd()) {
  return String(getPrivateRuntimeValue('CLOUDFLARE_API_TOKEN', env, baseDir) || '').trim();
}

function loadRuntimeConfig(env, baseDir = process.cwd()) {
  const sourceEnv = env === undefined ? loadRuntimeEnvironment(process.env, baseDir) : env;
  const configuredPort = sourceEnv?.SERVER_PORT || sourceEnv?.PORT;
  const warningMuteDurationMinutes = parseBoundedInteger(
    sourceEnv?.WARNING_MUTE_DURATION_MINUTES,
    120,
    1,
    1440,
  );
  const outputTokens = parseBoundedInteger(sourceEnv?.AI_MAX_OUTPUT_TOKENS, 2000, 500, 3000);

  const features = Object.freeze({
    groupQA: parseBoolean(sourceEnv?.ENABLE_GROUP_QA, true),
    privateQA: parseBoolean(sourceEnv?.ENABLE_PRIVATE_QA, true),
    internetSearch: parseBoolean(sourceEnv?.ENABLE_INTERNET_SEARCH, true),
    aiSummarization: parseBoolean(sourceEnv?.ENABLE_AI_SUMMARIZATION, true),
    linkModeration: parseBoolean(sourceEnv?.ENABLE_LINK_MODERATION, true),
  });

  const fullModerationExemptPhoneNumbers = parsePhoneAllowlist(sourceEnv?.FULL_MODERATION_EXEMPT_PHONE_NUMBERS);
  const legacyModerationExemptPhoneNumber = normalizePhoneNumber(sourceEnv?.FULL_MODERATION_EXEMPT_PHONE_NUMBER);
  if (legacyModerationExemptPhoneNumber) fullModerationExemptPhoneNumbers.add(legacyModerationExemptPhoneNumber);

  const security = Object.freeze({
    privateQaAllowedNumbers: parsePhoneAllowlist(sourceEnv?.PRIVATE_QA_ALLOWED_NUMBERS),
    privateQaAllowedLids: parseLidAllowlist(sourceEnv?.PRIVATE_QA_ALLOWED_LIDS),
    privateQaOwnerClaimCode: String(sourceEnv?.PRIVATE_QA_OWNER_CLAIM_CODE || '').trim(),
    privateQaOwnerClaimed: parseBoolean(sourceEnv?.PRIVATE_QA_OWNER_CLAIMED, false),
    fullModerationExemptPhoneNumber: normalizePhoneNumber(sourceEnv?.FULL_MODERATION_EXEMPT_PHONE_NUMBER),
    fullModerationExemptPhoneNumbers,
    groupRejoinApproverPhone: String(sourceEnv?.GROUP_REJOIN_APPROVER_PHONE || '').trim(),
  });

  const warningMute = Object.freeze({
    enabled: parseBoolean(sourceEnv?.WARNING_MUTE_ENABLED, true),
    durationMinutes: warningMuteDurationMinutes,
    durationMs: warningMuteDurationMinutes * 60 * 1000,
  });

  const requestedAiProvider = String(sourceEnv?.AI_PROVIDER || 'openrouter').trim().toLowerCase();
  const aiProvider = requestedAiProvider === 'cloudflare' ? 'cloudflare' : 'openrouter';
  const ai = Object.freeze({
    provider: aiProvider,
    model: String(sourceEnv?.OPENROUTER_MODEL || 'openai/gpt-6-luna').trim() || 'openai/gpt-6-luna',
    creativeModel: String(sourceEnv?.OPENROUTER_CREATIVE_MODEL || 'openrouter/free').trim() || 'openrouter/free',
    cloudflareTextModel: String(sourceEnv?.CLOUDFLARE_AI_TEXT_MODEL || '@cf/zai-org/glm-4.7-flash').trim() || '@cf/zai-org/glm-4.7-flash',
    visionModel: String(sourceEnv?.OPENROUTER_VISION_MODEL || 'openrouter/free').trim() || 'openrouter/free',
    maxOutputTokens: outputTokens,
  });

  const image = Object.freeze({
    cloudflareAccountId: String(sourceEnv?.CLOUDFLARE_ACCOUNT_ID || '').trim(),
    cloudflareModel: String(sourceEnv?.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell').trim() ||
      '@cf/black-forest-labs/flux-1-schnell',
  });

  const whatsapp = Object.freeze({
    phone: readWhatsAppPhone(sourceEnv, baseDir),
    resetSessionRequested: parseBoolean(sourceEnv?.RESET_WHATSAPP_SESSION, false),
  });

  return Object.freeze({
    features,
    security,
    warningMute,
    ai,
    image,
    whatsapp,
    serverPort: parseBoundedInteger(configuredPort, 5000, 1, 65535),
  });
}

const runtimeConfig = loadRuntimeConfig();

module.exports = {
  loadRuntimeConfig,
  runtimeConfig,
  parseBoolean,
  parseBoundedInteger,
  normalizePhoneNumber,
  normalizeLid,
  parsePhoneAllowlist,
  parseLidAllowlist,
  readOpenRouterApiKey,
  readCloudflareApiToken,
  readWhatsAppPhone,
};
