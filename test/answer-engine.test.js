'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAnswerEngine } = require('../lib/answer-engine');

function makeDependencies(overrides = {}) {
  const messages = [];
  const state = { searches: 0, summaries: 0 };
  const dependencies = {
    ENABLE_GROUP_QA: true,
    ENABLE_INTERNET_SEARCH: true,
    ENABLE_AI_SUMMARIZATION: true,
    looksLikeQuestion: () => true,
    isSensitiveSafetyRequest: () => false,
    safeSend: async (_socket, _jid, payload) => {
      messages.push(String(payload?.text || ''));
      return { key: { id: 'test-message' } };
    },
    buildVerifiedQuranLongestWordAnswer: () => null,
    answerSimpleMathQuestion: () => null,
    answerCommonPashtoQuestion: () => null,
    answerIdentityQuestion: () => null,
    buildAnswerPlan: () => ({ category: 'general', detailed: false }),
    requiresFactualSourceEvidence: () => false,
    answerFromOfflineKnowledge: () => null,
    normalizePashto: value => String(value || '').normalize('NFKC').toLowerCase(),
    hasTrustedReligiousReferenceText: () => false,
    requiresAuthoritativeReligiousSource: () => false,
    asksForReligiousReferences: () => false,
    requestsInternetSearch: () => false,
    isTimeSensitiveQuestion: () => false,
    searchInternet: async () => {
      state.searches += 1;
      return [];
    },
    isTafsirYaseerAuthorshipQuestion: () => false,
    filterTafsirYaseerAuthorSources: results => results,
    filterTrustedReligiousSources: results => results,
    summarizeSourcesInPashto: async () => {
      state.summaries += 1;
      return null;
    },
    formatVerifiedSourceLinks: () => '',
    formatInternetResults: (question, results) => 'د سرچینو پایلې: ' + question + ' (' + results.length + ')',
    readOpenRouterApiKey: () => '',
    ...overrides,
  };
  return { dependencies, messages, state };
}

test('politely declines restricted Taliban-related political questions before local answers, web search, or AI', async () => {
  const context = makeDependencies({
    readOpenRouterApiKey: () => 'test-key',
    answerFromOfflineKnowledge: () => 'دا باید د محلي پوهې له لارې ځواب نه شي.',
    searchInternet: async () => {
      context.state.searches += 1;
      return [{ title: 'Should not be searched', url: 'https://example.org', snippet: 'blocked topic' }];
    },
    summarizeSourcesInPashto: async () => {
      context.state.summaries += 1;
      return 'دا باید د AI ځواب نه وي.';
    },
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer(
    {},
    'group@g.us',
    'sender@s.whatsapp.net',
    'د اسلامي امارت سیاسي پالیسي څه ده؟',
    'member',
  );

  assert.equal(handled, true);
  assert.equal(context.state.searches, 0);
  assert.equal(context.state.summaries, 0);
  assert.equal(context.messages.length, 1);
  assert.match(context.messages[0], /بښنه غواړم/);
  assert.match(context.messages[0], /معلومات فعلاً زموږ په خدمت کې نشته/);
  assert.doesNotMatch(context.messages[0], /AI ځواب|سرچینې|طالبان/);
});

test('does not block an unrelated Islamic question in the answer engine', async () => {
  const context = makeDependencies({
    answerFromOfflineKnowledge: () => 'د اسلام پنځه بناوې شهادت، لمونځ، روژه، زکات او حج دي.',
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer(
    {},
    'group@g.us',
    'sender@s.whatsapp.net',
    'د اسلام پنځه بناوې څه دي؟',
    'member',
  );
  assert.equal(handled, true);
  assert.match(context.messages[0], /شهادت|بناوې/);
  assert.doesNotMatch(context.messages[0], /معلومات فعلاً زموږ په خدمت کې نشته/);
});

test('stops sensitive person-location or harm requests before web search', async () => {
  const context = makeDependencies({ isSensitiveSafetyRequest: () => true });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer({}, 'group@g.us', 'sender@s.whatsapp.net', 'دا چیرته اوسي؟', 'member');
  assert.equal(handled, true);
  assert.equal(context.state.searches, 0);
  assert.match(context.messages[0], /شخصي پتې|تعقیب|زیان رسولو/);
});

test('answers a stable local-knowledge question without calling external providers', async () => {
  const context = makeDependencies({
    answerFromOfflineKnowledge: () => 'دا د بوټ د محلي زېرمې ازمویښتي ځواب دی.',
    normalizePashto: value => String(value || '').normalize('NFKC').toLowerCase(),
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer({}, 'group@g.us', 'sender@s.whatsapp.net', 'زړه څه کوي؟', 'member');
  assert.equal(handled, true);
  assert.equal(context.state.searches, 0);
  assert.match(context.messages[0], /محلي زېرمې/);
});

test('combines an AI summary with verified links when relevant search results exist', async () => {
  const context = makeDependencies({
    buildAnswerPlan: () => ({ category: 'general', detailed: true }),
    searchInternet: async () => {
      context.state.searches += 1;
      return [{ title: 'Reference page', url: 'https://example.org/reference', snippet: 'Relevant reference excerpt', provider: 'test' }];
    },
    summarizeSourcesInPashto: async () => {
      context.state.summaries += 1;
      return 'دا د ازموینې لنډیز دی.';
    },
    formatVerifiedSourceLinks: () => '\n\nد تایید شوو سرچینو لینکونه',
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer({}, 'group@g.us', 'sender@s.whatsapp.net', 'دا موضوع په تفصیل تشریح کړه؟', 'member');
  assert.equal(handled, true);
  assert.equal(context.state.searches, 1);
  assert.equal(context.state.summaries, 1);
  assert.match(context.messages[0], /د ازموینې لنډیز/);
  assert.match(context.messages[0], /تایید شوو سرچینو لینکونه/);
  assert.match(context.messages[0], /د افغان AI ځواب/);
  assert.match(context.messages[0], /🗺️/);
  assert.doesNotMatch(context.messages[0], /🇦🇫/);
  assert.doesNotMatch(context.messages[0], /د AI ځواب/);
});

test('labels a source-required answer as unverified when no online source was found', async () => {
  const context = makeDependencies({
    buildAnswerPlan: () => ({ category: 'history', detailed: true }),
    requiresFactualSourceEvidence: () => true,
    readOpenRouterApiKey: () => 'test-key',
    searchInternet: async () => {
      context.state.searches += 1;
      return [];
    },
    summarizeSourcesInPashto: async () => 'دا د موضوع عمومي تشریح ده.',
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer(
    {},
    'group@g.us',
    'sender@s.whatsapp.net',
    'د یوه تاریخي موضوع عمومي شالید څه دی؟',
    'member',
  );

  assert.equal(handled, true);
  assert.match(context.messages[0], /عمومي تشریح/);
  assert.match(context.messages[0], /معتبره آنلاین سرچینه په دې ځل ونه موندل شوه/);
  assert.match(context.messages[0], /د آنلاین تایید شوې حوالې بدیل نه ده/);
});

test('does not invent a precise religious answer when authoritative evidence is unavailable', async () => {
  const context = makeDependencies({
    buildAnswerPlan: () => ({ category: 'religion', detailed: true }),
    requiresAuthoritativeReligiousSource: () => true,
    readOpenRouterApiKey: () => 'test-key',
    searchInternet: async () => {
      context.state.searches += 1;
      return [];
    },
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer({}, 'group@g.us', 'sender@s.whatsapp.net', 'د حدیث کره حواله راکړه؟', 'member');
  assert.equal(handled, true);
  assert.equal(context.state.searches, 1);
  assert.match(context.messages[0], /باوري سرچینه|شواهد|نه اټکلم/);
});
