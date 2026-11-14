'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_STATE_PATH = path.resolve(
  process.cwd(),
  'data',
  'group-rejoin-control.json'
);

const DIGITS = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

function normalizeDigits(value) {
  return String(value || '').replace(/[۰-۹٠-٩]/gu, (digit) => DIGITS[digit] || digit);
}

function normalizePhoneNumber(value) {
  let raw = normalizeDigits(value).trim().toLowerCase();
  if (!raw || /@lid$/u.test(raw)) return '';
  const atIndex = raw.lastIndexOf('@');
  if (atIndex >= 0) {
    const domain = raw.slice(atIndex + 1);
    if (!['s.whatsapp.net', 'c.us', 'whatsapp.net'].includes(domain)) return '';
    raw = raw.slice(0, atIndex);
  }
  let digits = raw.split(':')[0].replace(/\D/gu, '');
  if (digits.startsWith('0093')) digits = digits.slice(2);
  if (digits.startsWith('93') && digits.length === 11) {
    digits = '0' + digits.slice(2);
  }
  return digits.length >= 7 && digits.length <= 15 ? digits : '';
}

function participantIdentifiers(participant) {
  if (participant === null || participant === undefined) return [];
  const values = typeof participant === 'object'
    ? [
        participant.id,
        participant.jid,
        participant.lid,
        participant.phoneNumber,
        participant.phone,
        participant.participant,
        participant.participantPn,
        participant.pn,
      ]
    : [participant];

  const keys = new Set();
  for (const value of values) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const raw = normalizeDigits(value).trim().toLowerCase();
    if (!raw) continue;

    if (/@lid$/u.test(raw)) {
      const lid = raw.split('@')[0].split(':')[0].replace(/\D/gu, '');
      if (lid.length >= 5) keys.add('lid:' + lid);
      continue;
    }

    const phone = normalizePhoneNumber(raw);
    if (phone) {
      keys.add('phone:' + phone);
      continue;
    }

    // د نامعلومو WhatsApp پېژندپاڼو لپاره عین JID ساتل کېږي.
    if (raw.includes('@')) {
      keys.add('jid:' + raw.replace(/:\d+(?=@)/u, ''));
    }
  }
  return [...keys];
}

function defaultState() {
  return { version: 1, groups: {} };
}

function createGroupRejoinControl(options = {}) {
  const statePath = options.statePath || DEFAULT_STATE_PATH;

  function readState() {
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (!parsed || parsed.version !== 1 ||
          !parsed.groups || typeof parsed.groups !== 'object' ||
          Array.isArray(parsed.groups)) {
        throw new Error('د بېرته ننوتلو د کنټرول فایل جوړښت ناسم دی.');
      }
      return parsed;
    } catch (error) {
      if (error && error.code === 'ENOENT') return defaultState();
      throw error;
    }
  }

  function writeState(state) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const temporaryPath = statePath + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, statePath);
  }

  function getGroup(state, groupJid, create = false) {
    const id = String(groupJid || '').trim();
    if (!/^\d[\d-]*@g\.us$/u.test(id)) return null;
    if (!state.groups[id] && create) {
      state.groups[id] = { departed: [], approvals: [] };
    }
    const group = state.groups[id];
    if (!group) return null;
    if (!Array.isArray(group.departed)) group.departed = [];
    if (!Array.isArray(group.approvals)) group.approvals = [];
    return group;
  }

  function findMatchingIndex(records, keys) {
    const wanted = new Set(keys);
    if (!wanted.size) return -1;
    return records.findIndex((record) =>
      Array.isArray(record?.keys) && record.keys.some((key) => wanted.has(key))
    );
  }

  function recordDeparture(groupJid, participant) {
    const keys = participantIdentifiers(participant);
    if (!keys.length) return false;
    const state = readState();
    const group = getGroup(state, groupJid, true);
    if (!group) return false;

    const existingIndex = findMatchingIndex(group.departed, keys);
    const record = existingIndex >= 0 ? group.departed[existingIndex] : {
      keys: [],
      leftAt: new Date().toISOString(),
    };
    record.keys = [...new Set([...record.keys, ...keys])];
    record.leftAt = record.leftAt || new Date().toISOString();
    if (existingIndex >= 0) group.departed[existingIndex] = record;
    else group.departed.push(record);

    // د نوي وتلو ثبت، پخوانۍ اجازه بېرته لغوه کوي.
    group.approvals = group.approvals.filter((approval) =>
      !approval.keys.some((key) => keys.includes(key))
    );
    writeState(state);
    return true;
  }

  function hasDeparted(groupJid, participant) {
    const keys = participantIdentifiers(participant);
    if (!keys.length) return false;
    const state = readState();
    const group = getGroup(state, groupJid);
    return Boolean(group && findMatchingIndex(group.departed, keys) >= 0);
  }

  function authorizeReturn(groupJid, phoneNumber, approvedBy = '') {
    const phone = normalizePhoneNumber(phoneNumber);
    if (!phone) return false;
    const keys = ['phone:' + phone];
    const state = readState();
    const group = getGroup(state, groupJid);
    if (!group) return false;

    const departedIndex = findMatchingIndex(group.departed, keys);
    if (departedIndex < 0) return false;
    const departed = group.departed[departedIndex];

    group.approvals = group.approvals.filter((approval) =>
      findMatchingIndex([approval], departed.keys) < 0
    );
    group.approvals.push({
      keys: [...departed.keys],
      approvedAt: new Date().toISOString(),
      approvedBy: normalizePhoneNumber(approvedBy) || '',
    });
    writeState(state);
    return true;
  }

  function consumeApproval(groupJid, participant) {
    const keys = participantIdentifiers(participant);
    if (!keys.length) return false;
    const state = readState();
    const group = getGroup(state, groupJid);
    if (!group) return false;

    const departedIndex = findMatchingIndex(group.departed, keys);
    if (departedIndex < 0) return false;
    const departed = group.departed[departedIndex];
    const approvalIndex = findMatchingIndex(group.approvals, departed.keys);
    if (approvalIndex < 0) return false;

    group.departed.splice(departedIndex, 1);
    group.approvals.splice(approvalIndex, 1);
    writeState(state);
    return true;
  }

  function getStatus(groupJid) {
    const state = readState();
    const group = getGroup(state, groupJid);
    return {
      departedCount: group ? group.departed.length : 0,
      pendingApprovals: group ? group.approvals.length : 0,
    };
  }

  return {
    recordDeparture,
    hasDeparted,
    authorizeReturn,
    consumeApproval,
    getStatus,
  };
}

module.exports = {
  createGroupRejoinControl,
  normalizeDigits,
  normalizePhoneNumber,
  participantIdentifiers,
};
