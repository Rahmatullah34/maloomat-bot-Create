'use strict';

const fs = require('fs');
const path = require('path');

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
  const envKey = String(env?.OPENROUTER_API_KEY || '').trim();
  if (envKey) return envKey;

  try {
    return fs.readFileSync(path.resolve(baseDir, 'OPENROUTER_API_KEY'), 'utf8').trim();
  } catch {
    return '';
  }
}

function loadRuntimeConfig(env = process.env) {
  const configuredPort = env?.SERVER_PORT || env?.PORT;
  const warningMuteDurationMinutes = parseBoundedInteger(
    env?.WARNING_MUTE_DURATION_MINUTES,
    120,
    1,
    1440,
  );
  const outputTokens = parseBoundedInteger(env?.AI_MAX_OUTPUT_TOKENS, 2000, 500, 3000);

  const features = Object.freeze({
    groupQA: parseBoolean(env?.ENABLE_GROUP_QA, true),
    privateQA: parseBoolean(env?.ENABLE_PRIVATE_QA, true),
    internetSearch: parseBoolean(env?.ENABLE_INTERNET_SEARCH, true),
    aiSummarization: parseBoolean(env?.ENABLE_AI_SUMMARIZATION, true),
    linkModeration: parseBoolean(env?.ENABLE_LINK_MODERATION, true),
  });

  const security = Object.freeze({
    privateQaAllowedNumbers: parsePhoneAllowlist(env?.PRIVATE_QA_ALLOWED_NUMBERS),
    privateQaAllowedLids: parseLidAllowlist(env?.PRIVATE_QA_ALLOWED_LIDS),
    fullModerationExemptPhoneNumber: normalizePhoneNumber(env?.FULL_MODERATION_EXEMPT_PHONE_NUMBER),
  });

  const warningMute = Object.freeze({
    enabled: parseBoolean(env?.WARNING_MUTE_ENABLED, true),
    durationMinutes: warningMuteDurationMinutes,
    durationMs: warningMuteDurationMinutes * 60 * 1000,
  });

  const ai = Object.freeze({
    model: String(env?.OPENROUTER_MODEL || 'openai/gpt-6-luna').trim() || 'openai/gpt-6-luna',
    maxOutputTokens: outputTokens,
  });

  const whatsapp = Object.freeze({
    phone: readWhatsAppPhone(env),
    resetSessionRequested: parseBoolean(env?.RESET_WHATSAPP_SESSION, false),
  });

  return Object.freeze({
    features,
    security,
    warningMute,
    ai,
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
  readWhatsAppPhone,
};
