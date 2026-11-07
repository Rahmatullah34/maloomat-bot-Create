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

test('answers current Afghanistan date questions deterministically from the Kabul clock', async () => {
  const context = makeDependencies({
    getAfghanistanDateContext: () => ({
      gregorianDate: '2026-11-05',
      gregorianLongDate: 'November 5, 2026',
      solarHijriDate: '۱۴۰۵ عقرب ۱۴',
      localTime: '19:37',
    }),
    readOpenRouterApiKey: () => 'test-key',
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer(
    {},
    'group@g.us',
    'sender@s.whatsapp.net',
    'نن کومه نېټه ده؟',
    'member',
  );

  assert.equal(handled, true);
  assert.equal(context.state.searches, 0);
  assert.equal(context.state.summaries, 0);
  assert.match(context.messages[0], /November 5, 2026/);
  assert.match(context.messages[0], /2026-11-05/);
  assert.match(context.messages[0], /۱۴۰۵ عقرب ۱۴/);
  assert.match(context.messages[0], /19:37/);
});

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

test('formats Markdown emitted in answers using WhatsApp text syntax', async () => {
  const context = makeDependencies({
    answerSimpleMathQuestion: () => '## د حساب ځواب\n\n**پایله: ۴**\n- لومړی ټکی',
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer({}, 'group@g.us', 'sender@s.whatsapp.net', '۲ جمع ۲ څو کېږي؟', 'member');

  assert.equal(handled, true);
  assert.equal(context.messages[0], 'د حساب ځواب\n\n*پایله: ۴*\n• لومړی ټکی');
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
  assert.deepEqual(context.deliveries[0].payload.mentions, ['15551230000@s.whatsapp.net']);
  assert.match(context.deliveries[0].payload.text, /^@15551230000\s/);
  assert.equal(context.deliveries[0].options.quoted, originalMessage);
});

test('uses the quoted message as context for successive WhatsApp follow-up replies', async () => {
  const searchedQuestions = [];
  const context = makeDependencies({
    searchInternet: async question => {
      searchedQuestions.push(question);
      return [];
    },
  });
  const answer = createAnswerEngine(context.dependencies);

  await answer(
    {},
    '12345@g.us',
    '15551230000@s.whatsapp.net',
    'ولې؟',
    'ازموینه',
    {
      message: { key: { id: 'reply-one' } },
      quotedText: 'د زړه دنده څه ده؟',
    },
  );
  await answer(
    {},
    '12345@g.us',
    '15551230000@s.whatsapp.net',
    'دا څنګه کار کوي؟',
    'ازموینه',
    {
      message: { key: { id: 'reply-two' } },
      quotedText: 'زړه وینه ټول بدن ته پمپ کوي.',
    },
  );

  assert.equal(searchedQuestions.length, 2);
  assert.match(searchedQuestions[0], /د زړه دنده څه ده؟/);
  assert.match(searchedQuestions[0], /ولې؟/);
  assert.doesNotMatch(searchedQuestions[0], /د WhatsApp د مخکیني پیغام متن|لارښوونه/);
  assert.match(searchedQuestions[1], /دا څنګه کار کوي؟/);
  assert.doesNotMatch(searchedQuestions[1], /د WhatsApp د مخکیني پیغام متن|لارښوونه/);
  assert.equal(context.deliveries.length, 2);
  assert.equal(context.deliveries[0].options.quoted.key.id, 'reply-one');
  assert.equal(context.deliveries[1].options.quoted.key.id, 'reply-two');
});



test('keeps the original question and up to five successive WhatsApp reply turns isolated per sender', async () => {
  const summaryPrompts = [];
  const searchQueries = [];
  const context = makeDependencies({
    readOpenRouterApiKey: () => 'test-key',
    searchInternet: async query => {
      searchQueries.push(query);
      return [];
    },
    summarizeSourcesInPashto: async question => {
      summaryPrompts.push(question);
      return 'د ازموینې ځواب ' + summaryPrompts.length;
    },
  });
  const answer = createAnswerEngine(context.dependencies);
  const chat = '12345@g.us';
  const sender = '15551230000@s.whatsapp.net';

  await answer({}, chat, sender, 'افغانستان څو ولایتونه لري؟', 'ازموینه');
  assert.equal(context.messages.length, 1);

  const followups = [
    'نور وضاحت راکړه؟',
    'ولې؟',
    'څنګه؟',
    'یو مثال هم راکړه؟',
    'لنډیز یې راکړه؟',
  ];

  for (let index = 0; index < followups.length; index += 1) {
    const quotedText = context.messages[context.messages.length - 1];
    await answer(
      {},
      chat,
      sender,
      followups[index],
      'ازموینه',
      {
        message: { key: { id: 'reply-' + (index + 1) } },
        quotedText,
      },
    );
  }

  assert.equal(summaryPrompts.length, 6);
  assert.match(summaryPrompts[5], /افغانستان څو ولایتونه لري/);
  for (const followup of followups) {
    assert.ok(summaryPrompts[5].includes(followup), 'د پنځو Reply پړاوونو مخینه باید وساتل شي: ' + followup);
  }
  assert.equal(context.deliveries.length, 6);
  assert.equal(context.deliveries[5].options.quoted.key.id, 'reply-5');
  assert.equal(searchQueries.length, 6);
  assert.doesNotMatch(searchQueries[5], /د همدې کارن د وروستي بحث مخینه|د کارن پوښتنه\/تعقیب/);
});


test('routes a requested Pashto article through the configured free creative text generator', async () => {
  let creativePrompt = '';
  const context = makeDependencies({
    generateCreativeText: async prompt => {
      creativePrompt = prompt;
      return '## د چاپېریال په اړه مقاله\n\nدا د ازموینې مقاله ده.';
    },
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer(
    {},
    'group@g.us',
    'sender@s.whatsapp.net',
    'مقاله: د چاپېریال په اړه مقاله ولیکه',
    'member',
  );

  assert.equal(handled, true);
  assert.match(creativePrompt, /د لیکنې دنده/);
  assert.match(creativePrompt, /چاپېریال/);
  assert.match(context.messages[0], /د چاپېریال په اړه مقاله/);
  assert.equal(context.state.searches, 0);
});


test('answers only messages ending in a question mark, including replies', async () => {
  const context = makeDependencies({
    ENABLE_INTERNET_SEARCH: false,
    ENABLE_AI_SUMMARIZATION: false,
    looksLikeQuestion: value => {
      const text = String(value || '').trim();
      return text.endsWith('؟') || text.endsWith('?');
    },
    answerCommonPashtoQuestion: value => {
      const text = String(value || '').trim();
      return text.endsWith('؟') || text.endsWith('?')
        ? 'دا د پوښتنې ازمویښتي ځواب دی.'
        : null;
    },
  });
  const answer = createAnswerEngine(context.dependencies);

  const ordinaryRequest = await answer(
    {},
    'group@g.us',
    'sender@s.whatsapp.net',
    'معلومات راکړه',
    'member',
    {
      message: { key: { id: 'reply-without-mark' } },
      quotedText: 'د چاپېریال په اړه مخکینی ځواب',
    },
  );
  assert.equal(ordinaryRequest, false);
  assert.equal(context.messages.length, 0);

  const actualQuestion = await answer(
    {},
    'group@g.us',
    'sender@s.whatsapp.net',
    'د چاپېریال ساتنه ولې مهمه ده؟',
    'member',
  );
  assert.equal(actualQuestion, true);
  assert.equal(context.messages.length, 1);
  assert.match(context.messages[0], /د پوښتنې ازمویښتي ځواب/);
});

test('does not send an ordinary article request to the creative generator without a prefix', async () => {
  let creativeCalls = 0;
  const context = makeDependencies({
    ENABLE_INTERNET_SEARCH: false,
    ENABLE_AI_SUMMARIZATION: false,
    generateCreativeText: async () => {
      creativeCalls += 1;
      return 'دا باید د عادي غوښتنې لپاره ونه کارول شي.';
    },
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer(
    {},
    'group@g.us',
    'sender@s.whatsapp.net',
    'د چاپېریال په اړه مقاله ولیکه',
    'member',
  );
  assert.equal(handled, false);
  assert.equal(creativeCalls, 0);
  assert.equal(context.state.searches, 0);
  assert.equal(context.messages.length, 0);
});

test('generates a requested reply-based image and quotes the triggering WhatsApp message', async () => {
  const imageBuffer = Buffer.from('test-generated-image');
  const originalMessage = { key: { remoteJid: 'group@g.us', id: 'image-reply' } };
  let imagePrompt = '';
  const context = makeDependencies({
    generateImage: async prompt => {
      imagePrompt = prompt;
      return { buffer: imageBuffer, mimeType: 'image/jpeg' };
    },
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer(
    {},
    'group@g.us',
    'sender@s.whatsapp.net',
    'عکس: د همدې موضوع عکس جوړ کړه',
    'member',
    { message: originalMessage, quotedText: 'د پښتو الفبا د زده‌کړې لپاره ښوونیزه موضوع' },
  );

  assert.equal(handled, true);
  assert.match(imagePrompt, /پښتو الفبا/);
  assert.equal(context.deliveries[0].payload.image, imageBuffer);
  assert.equal(context.deliveries[0].options.quoted, originalMessage);
});

test('explains when the optional Cloudflare image generator is not configured', async () => {
  const context = makeDependencies({
    generateImage: async () => {
      const error = new Error('credentials missing');
      error.code = 'IMAGE_PROVIDER_NOT_CONFIGURED';
      throw error;
    },
  });
  const answer = createAnswerEngine(context.dependencies);
  const handled = await answer(
    {},
    'group@g.us',
    'sender@s.whatsapp.net',
    'د ښوونځي عکس جوړ کړه',
    'member',
  );

  assert.equal(handled, true);
  assert.match(context.messages[0], /CLOUDFLARE_ACCOUNT_ID/);
});
