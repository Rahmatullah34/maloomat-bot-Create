'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAnswerEngine } = require('../lib/answer-engine');

function makeDependencies(overrides = {}) {
  const messages = [];
  const deliveries = [];
  const state = { searches: 0, summaries: 0 };
  const dependencies = {
    ENABLE_GROUP_QA: true,
    ENABLE_INTERNET_SEARCH: true,
    ENABLE_AI_SUMMARIZATION: true,
    looksLikeQuestion: () => true,
    isSensitiveSafetyRequest: () => false,
    safeSend: async (_socket, _jid, payload, options) => {
      messages.push(String(payload?.text || ''));
      deliveries.push({ payload, options });
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
  return { dependencies, messages, deliveries, state };
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
  assert.match(context.messages[0], /د سرچینې یادونه/);
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

test('searches for sources before falling back to a stable local-knowledge answer', async () => {
  const context = makeDependencies({
    answerFromOfflineKnowledge: () => 'دا د بوټ د محلي زېرمې ازمویښتي ځواب دی.',
    normalizePashto: value => String(value || '').normalize('NFKC').toLowerCase(),
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer({}, 'group@g.us', 'sender@s.whatsapp.net', 'زړه څه کوي؟', 'member');
  assert.equal(handled, true);
  assert.equal(context.state.searches, 1);
  assert.match(context.messages[0], /محلي زېرمې/);
  assert.match(context.messages[0], /اړوندې آنلاین سرچینې ونه موندل شوې/);
});

test('uses source-backed research for ordinary questions even when offline knowledge already has an answer', async () => {
  const context = makeDependencies({
    answerFromOfflineKnowledge: () => 'زوړ محلي ځواب.',
    searchInternet: async () => {
      context.state.searches += 1;
      return [{ title: 'Relevant reference', url: 'https://example.org/topic', snippet: 'A directly relevant source excerpt.', provider: 'test' }];
    },
    summarizeSourcesInPashto: async (_question, sources) => {
      context.state.summaries += 1;
      assert.equal(sources.length, 1);
      return 'د سرچینې پر بنسټ نوی ځواب.';
    },
    formatVerifiedSourceLinks: () => '\\n\\n🔎 اړونده سرچینه: https://example.org/topic',
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer({}, 'group@g.us', 'sender@s.whatsapp.net', 'زړه څه کوي؟', 'member');
  assert.equal(handled, true);
  assert.equal(context.state.searches, 1);
  assert.equal(context.state.summaries, 1);
  assert.match(context.messages[0], /د سرچینې پر بنسټ نوی ځواب/);
  assert.match(context.messages[0], /اړونده سرچینه/);
  assert.doesNotMatch(context.messages[0], /زوړ محلي ځواب/);
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

test('includes a clearly labelled local answer when sources exist but AI summarization fails', async () => {
  const context = makeDependencies({
    buildAnswerPlan: () => ({ category: 'history', detailed: false }),
    requiresFactualSourceEvidence: () => true,
    answerFromOfflineKnowledge: () => 'دا د بوټ پخوانی عمومي تاریخي ځواب دی.',
    searchInternet: async () => {
      context.state.searches += 1;
      return [{ title: 'Relevant history source', url: 'https://example.org/history', snippet: 'A matching historical excerpt.', provider: 'test' }];
    },
    summarizeSourcesInPashto: async () => null,
    readOpenRouterApiKey: () => 'test-key',
    formatInternetResults: () => 'د اړوندو سرچینو موندنې او لینکونه.',
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer(
    {},
    'group@g.us',
    'sender@s.whatsapp.net',
    'دا تاریخي موضوع څه ده؟',
    'member',
  );

  assert.equal(handled, true);
  assert.equal(context.state.searches, 1);
  assert.match(context.messages[0], /اړوندو سرچینو موندنې/);
  assert.match(context.messages[0], /پخوانی عمومي تاریخي ځواب/);
  assert.match(context.messages[0], /آنلاین نه دی تایید شوی/);
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

test('returns a cautious local answer when sources and the AI service are unavailable', async () => {
  const context = makeDependencies({
    buildAnswerPlan: () => ({ category: 'history', detailed: false }),
    requiresFactualSourceEvidence: () => true,
    answerFromOfflineKnowledge: () => 'دا د موضوع عمومي تاریخي شالید دی.',
    searchInternet: async () => {
      context.state.searches += 1;
      return [];
    },
    readOpenRouterApiKey: () => '',
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer(
    {},
    'group@g.us',
    'sender@s.whatsapp.net',
    'دا تاریخي موضوع څه ده',
    'member',
  );

  assert.equal(handled, true);
  assert.equal(context.state.searches, 1);
  assert.equal(context.messages.length, 1);
  assert.match(context.messages[0], /عمومي تاریخي شالید/);
  assert.match(context.messages[0], /د سرچینې یادونه/);
  assert.match(context.messages[0], /تر خپلواکې تایید مخکې مه منئ/);
});

test('always sends an explanatory reply rather than silently dropping a question when every provider fails', async () => {
  const context = makeDependencies({
    buildAnswerPlan: () => ({ category: 'general', detailed: false }),
    searchInternet: async () => {
      context.state.searches += 1;
      return [];
    },
    readOpenRouterApiKey: () => '',
    answerFromOfflineKnowledge: () => null,
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer(
    {},
    'group@g.us',
    'sender@s.whatsapp.net',
    'یو نادر علمي مفهوم څه دی',
    'member',
  );

  assert.equal(handled, true);
  assert.equal(context.state.searches, 1);
  assert.equal(context.messages.length, 1);
  assert.match(context.messages[0], /ستاسې پوښتنه مې ترلاسه کړه/);
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

test('formats Markdown emitted in answers using WhatsApp text syntax', async () => {
  const context = makeDependencies({
    answerSimpleMathQuestion: () => '## د حساب ځواب\n\n**پایله: ۴**\n- لومړی ټکی',
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer({}, 'group@g.us', 'sender@s.whatsapp.net', '۲ جمع ۲ څو کېږي؟', 'member');

  assert.equal(handled, true);
  assert.equal(context.state.searches, 1);
  assert.match(context.messages[0], /^د حساب ځواب\n\n\*پایله: ۴\*\n• لومړی ټکی/);
  assert.match(context.messages[0], /د سرچینې یادونه/);
});

test('mentions the questioner and quotes the original group message for answer-engine replies', async () => {
  const context = makeDependencies({
    answerSimpleMathQuestion: () => 'د ازموینې ځواب دی.',
  });
  const answer = createAnswerEngine(context.dependencies);
  const originalMessage = {
    key: { remoteJid: '12345@g.us', id: 'original-message', participant: '15551230000@s.whatsapp.net' },
    message: { conversation: 'دا څو کېږي؟' },
  };
  const handled = await answer(
    {},
    '12345@g.us',
    '15551230000@s.whatsapp.net',
    'دا څو کېږي؟',
    'ازموینه',
    { message: originalMessage, mentionJid: '15551230000@s.whatsapp.net' },
  );

  assert.equal(handled, true);
  assert.equal(context.state.searches, 1);
  assert.deepEqual(context.deliveries[0].payload.mentions, ['15551230000@s.whatsapp.net']);
  assert.match(context.deliveries[0].payload.text, /^@15551230000\s/);
  assert.equal(context.deliveries[0].options.quoted, originalMessage);
});
