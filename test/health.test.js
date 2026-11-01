'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHealthPayload } = require('../lib/health');

function makeState(overrides = {}) {
  return {
    runtimeConfig: {
      features: {
        groupQA: true,
        internetSearch: true,
        aiSummarization: true,
        linkModeration: true,
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

test('health remains group-focused and contains no private-chat capabilities or allowlists', () => {
  const payload = buildHealthPayload(makeState());
  assert.equal(payload.questionAnswersEnabled, true);
  assert.equal(payload.webSearch, true);
  assert.equal(payload.privateQuestionAnswersEnabled, undefined);
  assert.equal(payload.privateQuestionAnswersConfigured, undefined);
  assert.equal(payload.readiness.privateQuestionAnswers, undefined);
  const output = JSON.stringify(payload);
  assert.doesNotMatch(output, /PRIVATE_QA|PRIVATE_FULL_SERVICES|93707285093/);
});
