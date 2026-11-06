'use strict';

function buildHealthPayload(state) {
  const config = state?.runtimeConfig || {};
  const features = config.features || {};
  const security = config.security || {};
  const warningMute = config.warningMute || {};
  const ai = config.ai || {};
  const whatsappConnectionState = String(state?.whatsappConnectionState || 'unknown');
  const whatsappConnected = whatsappConnectionState === 'connected';
  const authSessionSaved = Boolean(state?.authSessionSaved);
  const ready = whatsappConnected && authSessionSaved;
  const privateOwnerNumber = String(security.fullModerationExemptPhoneNumber || '').replace(/\D/g, '');
  const hasPrivateAllowlist = Boolean(
    privateOwnerNumber.length >= 7 &&
    security.privateQaAllowedNumbers?.size === 1 &&
    security.privateQaAllowedNumbers?.has(privateOwnerNumber)
  );
  const privateQuestionAnswersEnabled = Boolean(
    features.groupQA && features.privateQA && hasPrivateAllowlist
  );
  const aiKeyConfigured = Boolean(state?.aiKeyConfigured);

  return {
    ok: true,
    ready,
    status: ready ? 'ready' : 'degraded',
    service: 'maloomat-bot',
    mode: features.groupQA ? 'group-moderation+qa' : 'group-moderation-only',
    questionAnswersEnabled: Boolean(features.groupQA),
    privateQuestionAnswersEnabled,
    privateQuestionAnswersConfigured: hasPrivateAllowlist,
    aiSummarization: Boolean(features.groupQA && features.aiSummarization && aiKeyConfigured),
    webSearch: Boolean(features.groupQA && features.internetSearch),
    shamelaSearch: Boolean(features.groupQA && features.shamelaSearch),
    webSearchProviders: ['DuckDuckGo', 'Wikipedia EN', 'Wikipedia PS', 'GDELT news'],
    readiness: {
      whatsapp: { ok: whatsappConnected, state: whatsappConnectionState },
      authSession: { ok: authSessionSaved },
      privateQuestionAnswers: {
        ok: privateQuestionAnswersEnabled,
        enabledByConfig: Boolean(features.privateQA && features.groupQA),
        allowlistConfigured: hasPrivateAllowlist,
        ownerNumberMatch: hasPrivateAllowlist,
        allowlistCounts: {
          phoneNumbers: Number(security.privateQaAllowedNumbers?.size) || 0,
          lidsAccepted: 0,
        },
      },
      shamelaSearch: {
        ok: Boolean(features.groupQA && features.shamelaSearch),
        enabledByConfig: Boolean(features.groupQA && features.shamelaSearch),
      },
      aiSummarization: {
        ok: Boolean(features.groupQA && features.aiSummarization && aiKeyConfigured),
        enabledByConfig: Boolean(features.groupQA && features.aiSummarization),
        apiKeyConfigured: aiKeyConfigured,
      },
    },
    moderation: {
      badWords: true,
      links: Boolean(features.linkModeration),
      flood: true,
      repeatedMessages: true,
      maxMessagesPerWindow: 3,
      messageWindowSeconds: 30,
      warningWindowHours: 24,
      maxAIOutputTokens: ai.maxOutputTokens || 2000,
      thirdWarningMuteEnabled: Boolean(warningMute.enabled),
      thirdWarningMuteDurationMinutes: warningMute.durationMinutes || 120,
      thirdWarningMuteMethod: 'delete-messages-until-expiry',
      autoKick: false,
    },
    knowledgeEntries: Number(state?.knowledgeEntries) || 0,
    whatsapp: {
      connection: whatsappConnectionState,
      lastDisconnectCode: state?.whatsappLastDisconnectCode || null,
      lastDisconnectAt: state?.whatsappLastDisconnectAt || null,
      reconnectScheduled: Boolean(state?.reconnectScheduled),
      authSessionSaved,
      sessionResetRequested: Boolean(state?.sessionResetRequested),
      sessionResetMarkerPresent: Boolean(state?.sessionResetMarkerPresent),
    },
    allowedGroups: Number(state?.allowedGroups) || 0,
    historyCleanup: Boolean(state?.historyCleanup),
    autoPublishing: state?.autoPublishing || null,
  };
}

module.exports = { buildHealthPayload };
