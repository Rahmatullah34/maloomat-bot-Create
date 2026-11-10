'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHealthPayload } = require('../lib/health');

function makeState(overrides = {}) {
  return {
    runtimeConfig: {
      features: {
        groupQA: true,
        privateQA: true,
        internetSearch: true,
        aiSummarization: true,
        linkModeration: true,
      },
      security: {
        privateQaAllowedNumbers: new Set(),
        privateQaAllowedLids: new Set(),
        fullModerationExemptPhoneNumber: '',
      },
      warningMute: { enabled: true, durationMinutes: 120 },
      ai: { model: 'test-model', maxOutputTokens: 2000 },
    },
    whatsappConnectionState: 'connected',
    authSessionSaved: true,
    aiKeyConfigured: true,
    knowledgeEntries: 4,
    allowedGroups: 2,
    historyCleanup: false,
    autoPublishing: { enabled: false },
    ...overrides,
  };
}

test('reports readiness based on the actual WhatsApp state, not just HTTP availability', () => {
  const ready = buildHealthPayload(makeState());
  assert.equal(ready.ok, true);
  assert.equal(ready.ready, true);
  assert.equal(ready.status, 'ready');

  const starting = buildHealthPayload(makeState({ whatsappConnectionState: 'unknown' }));
  assert.equal(starting.ok, true);
  assert.equal(starting.ready, false);
  assert.equal(starting.status, 'degraded');
  assert.equal(starting.readiness.whatsapp.ok, false);
});

test('does not claim private Q&A is enabled unless an allowlist is configured', () => {
  const noAllowlist = buildHealthPayload(makeState());
  assert.equal(noAllowlist.privateQuestionAnswersEnabled, false);
  assert.equal(noAllowlist.privateQuestionAnswersConfigured, false);

  const allowlisted = buildHealthPayload(makeState({
    runtimeConfig: {
      ...makeState().runtimeConfig,
      security: {
        privateQaAllowedNumbers: new Set(['1234567890']),
        privateQaAllowedLids: new Set(),
        fullModerationExemptPhoneNumber: '1234567890',
      },
    },
  }));
  assert.equal(allowlisted.privateQuestionAnswersEnabled, true);
  assert.equal(allowlisted.privateQuestionAnswersConfigured, true);
});

test('reports allowlist counts for private Q&A without returning sender identifiers', () => {
  const configured = buildHealthPayload(makeState({
    runtimeConfig: {
      ...makeState().runtimeConfig,
      security: {
        privateQaAllowedNumbers: new Set(['15551234567']),
        privateQaAllowedLids: new Set(['123456789012345', '123456789012346']),
        fullModerationExemptPhoneNumber: '15551234567',
      },
    },
  }));
  assert.deepEqual(
    configured.readiness.privateQuestionAnswers.allowlistCounts,
    { phoneNumbers: 1, lidsAccepted: 0 },
  );
  const output = JSON.stringify(configured);
  assert.equal(output.includes('15551234567'), false);
  assert.equal(output.includes('123456789012345'), false);
});

test('never returns secret values or phone/LID identifiers from its config', () => {
  const state = makeState();
  state.runtimeConfig.security.privateQaAllowedNumbers.add('12025550100');
  state.runtimeConfig.security.privateQaAllowedLids.add('123456789012345');
  const output = JSON.stringify(buildHealthPayload(state));
  assert.equal(output.includes('12025550100'), false);
  assert.equal(output.includes('123456789012345'), false);
  assert.equal(output.includes('local-secret'), false);
  assert.equal(output.includes('env-secret'), false);
});


test('reports English course schedule without exposing group identifiers', () => {
  const status = {
    enabled: true,
    timeZone: 'Asia/Kabul',
    schedule: '20:00',
    targetConfigured: true,
    targetCount: 1,
    started: false,
    currentDay: 1,
    running: true,
    lastResult: 'waiting-for-next-slot',
  };
  const payload = buildHealthPayload(makeState({ englishCourse: status }));
  assert.deepEqual(payload.englishCourse, status);
  assert.equal(JSON.stringify(payload).includes('@g.us'), false);
});
