'use strict';

const patchedConsoles = new WeakSet();
const LOG_METHODS = Object.freeze(['log', 'info', 'warn', 'error', 'debug', 'trace']);
const REDACTED_SESSION_LOG = '[SECURITY] د WhatsApp د کوډي ناستې تفصیلات د لاګ له چاپ څخه پټ شول.';

function looksLikeSignalSessionObject(value, depth = 0, visited = new Set()) {
  if (!value || typeof value !== 'object' || depth > 3 || visited.has(value)) return false;
  visited.add(value);

  const keys = Object.keys(value);
  const hasRatchetState = keys.includes('currentRatchet') &&
    (keys.includes('_chains') || keys.includes('indexInfo') || keys.includes('registrationId'));
  if (hasRatchetState) return true;

  const sensitiveKeyNames = /^(?:privKey|privateKey|rootKey|chainKey|ephemeralKeyPair|lastRemoteEphemeralKey|remoteIdentityKey|pendingPreKey)$/iu;
  if (keys.some(key => sensitiveKeyNames.test(key)) &&
      (keys.includes('_chains') || keys.includes('currentRatchet') || keys.includes('registrationId'))) {
    return true;
  }

  return keys.some(key => looksLikeSignalSessionObject(value[key], depth + 1, visited));
}

function installSensitiveLogRedaction(targetConsole = console) {
  if (!targetConsole || (typeof targetConsole !== 'object' && typeof targetConsole !== 'function')) {
    throw new TypeError('installSensitiveLogRedaction requires a console-like object');
  }
  if (patchedConsoles.has(targetConsole)) return targetConsole;

  for (const method of LOG_METHODS) {
    if (typeof targetConsole[method] !== 'function') continue;
    const original = targetConsole[method].bind(targetConsole);

    targetConsole[method] = (...args) => {
      const text = args.filter(value => typeof value === 'string').join(' ');
      const sensitiveSessionText = /closing session|sessionentry/iu.test(text);
      const sensitiveSessionObject = args.some(value => looksLikeSignalSessionObject(value));
      if (sensitiveSessionText || sensitiveSessionObject) {
        return original(REDACTED_SESSION_LOG);
      }
      return original(...args);
    };
  }

  patchedConsoles.add(targetConsole);
  return targetConsole;
}

module.exports = {
  installSensitiveLogRedaction,
  looksLikeSignalSessionObject,
  REDACTED_SESSION_LOG,
};
