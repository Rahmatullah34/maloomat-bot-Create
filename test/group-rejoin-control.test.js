'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createGroupRejoinControl,
  normalizePhoneNumber,
  participantIdentifiers,
} = require('../lib/group-rejoin-control');

function temporaryControl() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maloomat-rejoin-'));
  const statePath = path.join(dir, 'data', 'group-rejoin-control.json');
  return {
    statePath,
    create: () => createGroupRejoinControl({ statePath }),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

test('normalizes Afghan local and international phone-number forms', () => {
  assert.equal(normalizePhoneNumber('0707285093'), '0707285093');
  assert.equal(normalizePhoneNumber('93707285093@s.whatsapp.net'), '0707285093');
  assert.equal(normalizePhoneNumber('+93 70 728 5093'), '0707285093');
  assert.equal(normalizePhoneNumber('۰۷۰۷۲۸۵۰۹۳'), '0707285093');
});

test('keeps PN and LID identifiers together for cross-format matching', () => {
  const keys = participantIdentifiers({
    id: '123456789012345@lid',
    phoneNumber: '93707285093@s.whatsapp.net',
  });
  assert.ok(keys.includes('lid:123456789012345'));
  assert.ok(keys.includes('phone:0707285093'));
});

test('does not treat new members as departed and records only the selected group', () => {
  const temp = temporaryControl();
  try {
    const control = temp.create();
    assert.equal(control.hasDeparted('12345-678@g.us', '0701111222@s.whatsapp.net'), false);
    assert.equal(control.recordDeparture('12345-678@g.us', '0701111222@s.whatsapp.net'), true);
    assert.equal(control.hasDeparted('12345-678@g.us', '93701111222@s.whatsapp.net'), true);
    assert.equal(control.hasDeparted('99999-888@g.us', '0701111222@s.whatsapp.net'), false);
  } finally {
    temp.cleanup();
  }
});

test('a departed member can return only after a one-time explicit approval', () => {
  const temp = temporaryControl();
  try {
    const control = temp.create();
    const group = '12345-678@g.us';
    const leaver = '0701111222@s.whatsapp.net';

    control.recordDeparture(group, leaver);
    assert.equal(control.hasDeparted(group, leaver), true);
    assert.equal(control.consumeApproval(group, leaver), false);
    assert.equal(control.authorizeReturn(group, '0702222333'), false);
    assert.equal(control.authorizeReturn(group, '93701111222', '0707285093'), true);
    assert.equal(control.hasApproval(group, leaver), true);
    assert.equal(control.consumeApproval(group, leaver), true);
    assert.equal(control.hasApproval(group, leaver), false);
    assert.equal(control.hasDeparted(group, leaver), false);
    assert.equal(control.consumeApproval(group, leaver), false);
  } finally {
    temp.cleanup();
  }
});

test('departure records and approved returns persist across service restarts', () => {
  const temp = temporaryControl();
  try {
    let control = temp.create();
    const group = '12345-678@g.us';
    const leaver = {
      id: '123456789012345@lid',
      phoneNumber: '93701111222@s.whatsapp.net',
    };
    control.recordDeparture(group, leaver);
    assert.equal(control.authorizeReturn(group, '0701111222'), true);

    control = temp.create();
    assert.equal(control.hasDeparted(group, '0701111222@s.whatsapp.net'), true);
    assert.equal(control.consumeApproval(group, '123456789012345@lid'), true);
    assert.equal(control.hasDeparted(group, leaver), false);
  } finally {
    temp.cleanup();
  }
});

test('a new departure revokes any unused return approval', () => {
  const temp = temporaryControl();
  try {
    const control = temp.create();
    const group = '12345-678@g.us';
    const leaver = '0701111222@s.whatsapp.net';
    control.recordDeparture(group, leaver);
    assert.equal(control.authorizeReturn(group, '0701111222'), true);
    control.recordDeparture(group, leaver);
    assert.equal(control.consumeApproval(group, leaver), false);
    assert.equal(control.hasDeparted(group, leaver), true);
  } finally {
    temp.cleanup();
  }
});
