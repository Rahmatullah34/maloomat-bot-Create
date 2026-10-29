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
      },
    },
  }));
  assert.equal(allowlisted.privateQuestionAnswersEnabled, true);
  assert.equal(allowlisted.privateQuestionAnswersConfigured, true);
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
