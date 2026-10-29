'use strict';

const fs = require('fs');
const path = require('path');

const PRIVATE_RUNTIME_CONFIG_KEYS = new Set([
  'PRIVATE_QA_ALLOWED_NUMBERS',
  'FULL_MODERATION_EXEMPT_PHONE_NUMBER',
  'ALLOWED_LINK_SENDERS',
  'PRIVATE_QA_ALLOWED_LIDS',
]);

function readPrivateRuntimeConfig(baseDir = process.cwd()) {
  let parsed;
  try {
    parsed = JSON.parse(
      fs.readFileSync(path.resolve(baseDir, 'private-runtime-config.json'), 'utf8')
    );
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const config = {};
  for (const key of PRIVATE_RUNTIME_CONFIG_KEYS) {
    if (typeof parsed[key] === 'string') {
      config[key] = parsed[key];
    }
  }
  return config;
}

function getPrivateRuntimeValue(name, env = process.env, baseDir = process.cwd()) {
  if (!PRIVATE_RUNTIME_CONFIG_KEYS.has(name)) {
    return String(env?.[name] ?? '');
  }

  const environmentValue = String(env?.[name] ?? '');
  if (environmentValue.trim()) return environmentValue;

  return readPrivateRuntimeConfig(baseDir)[name] ?? '';
}

function loadRuntimeEnvironment(env = process.env, baseDir = process.cwd()) {
  const fileConfig = readPrivateRuntimeConfig(baseDir);
  const merged = { ...(env || {}) };

  for (const key of PRIVATE_RUNTIME_CONFIG_KEYS) {
    const environmentValue = String(env?.[key] ?? '');
    if (environmentValue.trim()) {
      merged[key] = environmentValue;
    } else if (Object.prototype.hasOwnProperty.call(fileConfig, key)) {
      merged[key] = fileConfig[key];
    } else {
      merged[key] = environmentValue;
    }
  }

  return merged;
}

module.exports = {
  PRIVATE_RUNTIME_CONFIG_KEYS,
  readPrivateRuntimeConfig,
  getPrivateRuntimeValue,
  loadRuntimeEnvironment,
};
