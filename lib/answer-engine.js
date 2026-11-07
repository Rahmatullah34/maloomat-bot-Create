'use strict';

const { formatWhatsAppText } = require('./whatsapp-format');

const {
  isRestrictedPoliticalTopic,
  RESTRICTED_POLITICAL_REPLY,
} = require('./restricted-political-topic');

function extractArticleTopic(text) {
  const raw = String(text || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  const patterns = [
    /^(?:مهرباني\s+)?(?:د\s+)?(.+?)\s+(?:په\s+اړه|په\s+هکله|په\s+باره\s+کې)\s+(?:یوه\s+)?(?:معلوماتي\s+)?(?:لیکنه|مقاله|مضمون)(?:\s+(?:راته\s+)?(?:راکړه|ولیکه|وليکه|راوباسه|راوباسئ|جوړه\s+کړه|جوړه\s+کړئ|چمتو\s+کړه|وکړه))?\s*[.!؟?]*$/iu,
    /^(?:لیکنه|مقاله|مضمون)\s*[:：-]\s*(.+?)\s*[.!؟?]*$/iu,
    /^(?:write|create|draft)\s+(?:an?\s+)?(?:article|essay)\s+(?:about|on)\s+(.+?)\s*[.!?]*$/iu,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    const topic = String(match[1] || '').trim().replace(/^[«“"']+|[»”"']+$/gu, '');
    if (topic.length >= 3 && topic.length <= 180) return topic;
  }
  return '';
}

function cleanQuotedTextForSearch(value) {
  return String(value || '')
    .replace(/https?:\/\/\S+/giu, ' ')
    .replace(/(?:🗺️\s*)?\*?د سرچینو په مرسته د افغان AI ځواب\*?/giu, ' ')
    .replace(/(?:🗺️\s*)?\*?د افغان AI ځواب\*?/giu, ' ')
    .replace(/(?:📚\s*)?\*?د بوټ له ثبت شوو معلوماتو څخه:?\*?/giu, ' ')
    .replace(/(?:🔗\s*)?(?:د تایید شوو سرچینو لینکونه|د سرچینو لینکونه|سرچینې)\s*:[\s\S]*$/iu, ' ')
    .replace(/[*_\x60#]/gu, ' ')
    .replace(/[\r\n]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 220);
}

function buildReplySearchQuery(quotedText, followupText) {
  const followup = String(followupText || '').trim();
  if (!followup) return cleanQuotedTextForSearch(quotedText);

  // لنډې تعقیبي پوښتنې لکه «ولې؟» او «څنګه؟» د نقل شوي ځواب له موضوع پرته
  // د لټون لپاره کافي مانا نه لري؛ اوږدې او روښانه پوښتنې پخپله وپلټه.
  const needsContext = followup.length <= 55;
  if (!needsContext) return followup.slice(0, 320);

  const context = cleanQuotedTextForSearch(quotedText);
  return [context, followup].filter(Boolean).join(' ').slice(0, 320);
}

function createAnswerEngine(dependencies) {
  const {
    ENABLE_GROUP_QA,
    ENABLE_INTERNET_SEARCH,
    ENABLE_AI_SUMMARIZATION,
    looksLikeQuestion,
    isSensitiveSafetyRequest,
    safeSend,
    buildVerifiedQuranLongestWordAnswer,
    answerSimpleMathQuestion,
    answerCommonPashtoQuestion,
    answerIdentityQuestion,
    buildAnswerPlan,
    requiresFactualSourceEvidence,
    answerFromOfflineKnowledge,
    normalizePashto,
    hasTrustedReligiousReferenceText,
    requiresAuthoritativeReligiousSource,
    asksForReligiousReferences,
    requestsInternetSearch,
    isTimeSensitiveQuestion,
    searchInternet,
    isTafsirYaseerAuthorshipQuestion,
    filterTafsirYaseerAuthorSources,
    filterTrustedReligiousSources,
    summarizeSourcesInPashto,
    formatVerifiedSourceLinks,
    formatInternetResults,
    readOpenRouterApiKey,
    getAfghanistanDateContext,
  } = dependencies;

  if (!dependencies || typeof safeSend !== 'function' || typeof searchInternet !== 'function') {
    throw new TypeError('createAnswerEngine requires safeSend and searchInternet dependencies');
  }

  // د هر ګروپ/شخصي چټ او هر کارن د Reply جلا مخینه؛ تر پنځو تعقیبي پړاوونو پورې.
  const replyThreads = new Map();
  const MAX_REPLY_TURNS = 5;
  const REPLY_THREAD_TTL_MS = 30 * 60 * 1000;

  return async function answerWithKnowledge(socket, groupJid, participantJid, question, participantName, replyContext = null) {
  const originalQuestion = String(question || '').trim();
  const quotedText = String(replyContext?.quotedText || '').trim().slice(0, 1800);
  const hasReplyContext = Boolean(quotedText);
  const threadKey = String(groupJid || '') + '|' + String(participantJid || '');
  const now = Date.now();

  for (const [key, state] of replyThreads) {
    if (now - state.updatedAt > REPLY_THREAD_TTL_MS) replyThreads.delete(key);
  }

  let threadState = replyThreads.get(threadKey);
  if (!hasReplyContext) {
    threadState = {
      turns: [{ question: originalQuestion, quotedText: '', answerText: '' }],
      replyTurns: 0,
      lastBotAnswer: '',
      updatedAt: now,
    };
  } else {
    const quoteMatchesLatestBotAnswer = Boolean(
      threadState?.lastBotAnswer &&
      String(threadState.lastBotAnswer).replace(/\s+/gu, ' ').trim() ===
        quotedText.replace(/\s+/gu, ' ').trim()
    );

    if (quoteMatchesLatestBotAnswer) {
      threadState.turns.push({
        question: originalQuestion,
        quotedText,
        answerText: '',
      });
      threadState.replyTurns = Math.min(MAX_REPLY_TURNS, (threadState.replyTurns || 0) + 1);
      // لومړنۍ پوښتنه او تر پنځو وروستیو Reply پړاوونو ساتل کېږي.
      if (threadState.turns.length > MAX_REPLY_TURNS + 1) {
        threadState.turns.splice(1, threadState.turns.length - (MAX_REPLY_TURNS + 1));
      }
    } else {
      // که Reply د بل چا پیغام یا د زاړه بحث ځواب ته وي، نوی جلا تسلسل پیل کړه.
      threadState = {
        turns: [{ question: originalQuestion, quotedText, answerText: '' }],
        replyTurns: 1,
        lastBotAnswer: '',
        updatedAt: now,
      };
    }
  }

  threadState.updatedAt = now;
  replyThreads.set(threadKey, threadState);
  while (replyThreads.size > 500) {
    const oldestKey = replyThreads.keys().next().value;
    if (!oldestKey) break;
    replyThreads.delete(oldestKey);
  }

  const replyHistoryPrompt = hasReplyContext
    ? 'د همدې کارن د وروستي بحث مخینه (تر پنځو Reply پړاوونو):\n' +
      threadState.turns.map((turn, index) => {
        const parts = [];
        if (turn.question) parts.push('د کارن پوښتنه/تعقیب: ' + turn.question);
        if (turn.quotedText) parts.push('هغه پخوانی پیغام چې Reply پرې شوی: ' + turn.quotedText);
        if (turn.answerText) parts.push('د بوټ ځواب: ' + turn.answerText.slice(0, 900));
        return (index + 1) + '. ' + parts.join('\n');
      }).join('\n\n') +
      '\n\nد کارن وروستۍ پوښتنې ته د همدې مخینې په رڼا کې ځواب ورکړه.'
    : '';

  const searchQuestion = hasReplyContext
    ? buildReplySearchQuery(quotedText, originalQuestion)
    : originalQuestion;

  const sendAnswer = async (targetSocket, targetJid, payload) => {
    const formattedPayload = payload && typeof payload.text === 'string'
      ? { ...payload, text: formatWhatsAppText(payload.text) }
      : payload;

    let result;
    if (replyContext?.message && targetJid === groupJid && formattedPayload && typeof formattedPayload.text === 'string') {
      const mentionJid = String(replyContext.mentionJid || '').trim();
      const isPhoneJid = /@(?:s\.whatsapp\.net|c\.us)$/iu.test(mentionJid);
      const mentionNumber = isPhoneJid
        ? mentionJid.split('@')[0].split(':')[0].replace(/\D/g, '')
        : '';
      let answerPayload = formattedPayload;
      if (mentionNumber.length >= 7 && mentionNumber.length <= 15) {
        const mentionToken = '@' + mentionNumber;
        answerPayload = {
          ...formattedPayload,
          text: formattedPayload.text.includes(mentionToken)
            ? formattedPayload.text
            : mentionToken + ' ' + formattedPayload.text,
          mentions: [mentionJid],
        };
      }
      result = await safeSend(targetSocket, targetJid, answerPayload, { quoted: replyContext.message });
    } else {
      result = await safeSend(targetSocket, targetJid, formattedPayload);
    }

    if (result && typeof formattedPayload?.text === 'string') {
      threadState.lastBotAnswer = formattedPayload.text;
      const lastTurn = threadState.turns[threadState.turns.length - 1];
      if (lastTurn) lastTurn.answerText = formattedPayload.text;
      threadState.updatedAt = Date.now();
      replyThreads.set(threadKey, threadState);
    }
    return result;
  };

  // پخوانۍ پوښتنې او ځوابونه د AI لپاره ساته؛ د ویب لټون query جلا او لنډ پاتې کېږي.
  if (hasReplyContext && originalQuestion) {
    question = replyHistoryPrompt;
  }

  // د پوښتنو ځوابونه فعال دي؛ د ګروپ نظم/منځپانګې کنټرولونه جلا ساتل شوي دي.
  if (!ENABLE_GROUP_QA) return false;

  // لیکنه یوازې هغه وخت جوړېږي چې کاروونکی یې په څرګند ډول وغواړي؛
  // عادي خبرې او عادي پوښتنې په اتومات ډول په مقاله نه بدلېږي.
  // د نن ورځې د نېټې پوښتنې د AI پر حافظه نه پرېږدو؛ نېټه د سرور له ساعت څخه مستقیمه اخلو.
  const asksForCurrentDate = /(?:نن.{0,30}(?:نېټه|تاریخ)|(?:نېټه|تاریخ).{0,30}نن|اوسن(?:ی|ۍ).{0,20}(?:نېټه|تاریخ)|today'?s?\s+date|what(?:'s| is)\s+(?:the\s+)?date|current\s+date)/iu.test(String(question || ''));
  if (asksForCurrentDate && typeof getAfghanistanDateContext === 'function') {
    const dateContext = getAfghanistanDateContext();
    await sendAnswer(socket, groupJid, {
      text: '📅 د افغانستان د نن ورځې نېټه:\n' +
        '• میلادي: ' + dateContext.gregorianLongDate + ' (' + dateContext.gregorianDate + ')\n' +
        '• هجري شمسي: ' + dateContext.solarHijriDate + '\n' +
        '• د افغانستان وخت: ' + dateContext.localTime + ' (Asia/Kabul)',
    });
    return true;
  }

  const articleTopic = extractArticleTopic(question);
  if (articleTopic) {
    if (isRestrictedPoliticalTopic(question)) {
      await sendAnswer(socket, groupJid, { text: RESTRICTED_POLITICAL_REPLY });
      return true;
    }
    if (isSensitiveSafetyRequest(question)) {
      await sendAnswer(socket, groupJid, {
        text: '🛡️ د شخصي پتې، شخصي شمېرې، دقیق ځای، تعقیب یا زیان رسولو لپاره لیکنه نه شم جوړولای.',
      });
      return true;
    }
    const articlePrompt =
      'د «' + articleTopic + '» په اړه یوه منظمه، بشپړه خو بې‌تکراره معلوماتي لیکنه په روانه پښتو ولیکه. ' +
      'لیکنه دې مستقل سرلیک، لنډه سریزه، د موضوع مهم اړخونه، روښانه تشریح او پایله ولري. ' +
      'د موضوع له اړتیا سره سم مناسب اوږدوالی وټاکه؛ بې‌اړخه جزئیات، جعلي نېټې، شمېرې، سرچینې او ادعاوې مه جوړوه. ' +
      'که موضوع تازه یا بدلېدونکې وي، یوازې د ورکړل شوو باوري سرچینو پر بنسټ یې بیان کړه او د سرچینې نشتوالی واضح کړه.';
    let articleSources = [];
    if (ENABLE_INTERNET_SEARCH) {
      try {
        const foundSources = await searchInternet('د ' + articleTopic + ' په اړه معلومات');
        articleSources = Array.isArray(foundSources) ? foundSources : [];
      } catch (error) {
        console.warn('⚠️ د لیکنې لپاره د انټرنېټ لټون ناکام شو:', error?.message || error);
      }
    }
    const article = ENABLE_AI_SUMMARIZATION && readOpenRouterApiKey()
      ? await summarizeSourcesInPashto(articlePrompt, articleSources, '')
      : null;
    if (article) {
      await sendAnswer(socket, groupJid, {
        text: '📝 *معلوماتي لیکنه: ' + articleTopic + '*\n\n' + article +
          (articleSources.length && typeof formatVerifiedSourceLinks === 'function' ? formatVerifiedSourceLinks(articleSources) :
            '\n\nℹ️ د دې لیکنې لپاره آنلاین سرچینې په دې ځل ونه موندل شوې؛ متن د عمومي معلوماتو پر بنسټ برابر شوی دی.'),
      });
    } else {
      await sendAnswer(socket, groupJid, {
        text: '📝 د «' + articleTopic + '» په اړه لیکنه دا ځل بشپړه نه شوه. د OpenRouter API کیلي، اعتبار او د AI لنډیز تنظیمات وګورئ؛ یا د موضوع لپاره یوه باوري سرچینه/لینک راولېږئ.',
      });
    }
    return true;
  }

  // بوټ یوازې واضح پوښتنو یا ښکاره انټرنېټي لټون غوښتنو ته ځواب ورکوي.
  // عادي معلوماتي پوسټونه او هغه متنونه چې یوازې یوه کلیدي کلمه لري، بې‌ځوابه پرېږدي.
  if (!looksLikeQuestion(question) && !hasReplyContext) {
    return false;
  }

  // د کاروونکي د خوندیتوب لپاره د طالبانو/اسلامي امارت اړوند حساس سیاسي موضوعات
  // له ویب لټون، محلي ځوابونو او AI څخه مخکې په درناوي بندوو.
  if (isRestrictedPoliticalTopic(question)) {
    await sendAnswer(socket, groupJid, { text: RESTRICTED_POLITICAL_REPLY });
    return true;
  }

  // د هر ډول انټرنېټي لټون یا AI لنډیز تر مخه د محرمیت او زیان اړوند غوښتنې ودرول شي.
  if (isSensitiveSafetyRequest(question)) {
    await sendAnswer(socket, groupJid, {
      text: '🛡️ د خلکو د شخصي پتې، شخصي شمېرې، دقیق ځای، تعقیب یا زیان رسولو لپاره معلومات نه شم برابرولای.\n\n' +
        '🌐 که پوښتنه عمومي یا سیاسي وي، کولای شم بې‌طرفه، عامه او د باوري سرچینو پر بنسټ معلومات وړاندې کړم.'
    });
    return true;
  }

  // د قرآن د اوږدې کلمې عربي بڼه له مستند مصحفي متن څخه مستقیمه ورکوو؛ AI ته یې له حافظې د بیا لیکلو اړتیا نه پرېږدو.
  const verifiedQuranTextAnswer = buildVerifiedQuranLongestWordAnswer(question);
  if (verifiedQuranTextAnswer) {
    await sendAnswer(socket, groupJid, { text: verifiedQuranTextAnswer });
    return true;
  }

  const mathAnswer = answerSimpleMathQuestion(question);
  if (mathAnswer) {
    await sendAnswer(socket, groupJid, { text: mathAnswer });
    return true;
  }

  const commonAnswer = answerCommonPashtoQuestion(question);
  if (commonAnswer) {
    await sendAnswer(socket, groupJid, { text: commonAnswer });
    return true;
  }

  const identityAnswer = answerIdentityQuestion(
    groupJid, participantJid, participantName, question
  );
  if (identityAnswer) {
    await sendAnswer(socket, groupJid, { text: identityAnswer });
    return true;
  }

  const answerPlan = buildAnswerPlan(question);
  const requiresFactualEvidence = requiresFactualSourceEvidence(question, answerPlan.category);
  const localAnswer = answerFromOfflineKnowledge(question);
  const asksAfghanistanContext = /افغانستان|افغاني|afghanistan|کابل|kabul/iu.test(question);
  const localAnswerCoversContext = Boolean(
    localAnswer && /افغانستان|افغاني|afghanistan|کابل|kabul/iu.test(normalizePashto(localAnswer))
  );
  // د افغانستان د ځانګړي حالت پوښتنه باید له عمومي ځواب سره په غلطۍ بدله نه شي.
  const localContextMismatch = Boolean(
    localAnswer && asksAfghanistanContext && !localAnswerCoversContext
  );
  let usableLocalAnswer = localContextMismatch ? '' : localAnswer;
  const hasVerifiedLocalReligiousSource = Boolean(
    usableLocalAnswer && hasTrustedReligiousReferenceText(usableLocalAnswer, question)
  );
  const requiresLocalReligiousEvidence = answerPlan.category === 'religion' &&
    (requiresAuthoritativeReligiousSource(question) || asksForReligiousReferences(question));
  if (answerPlan.category === 'religion' && usableLocalAnswer &&
      !hasVerifiedLocalReligiousSource && requiresLocalReligiousEvidence) {
    console.warn('ℹ️ د دیني پوښتنې لپاره محلي ځواب معتبر ماخذ نه لري؛ د دقیقې حوالې غوښتنه بې‌سرچینې نه ځوابېږي.');
    usableLocalAnswer = '';
  }

  // د کره او نسبتاً ثابتې محلي موضوع لپاره مستقیم ځواب ورکړه؛ بې‌اړخه ویب پایلې مه ورسره ګډوه.
  if (
    usableLocalAnswer &&
    !requiresFactualEvidence &&
    !answerPlan.detailed &&
    !requestsInternetSearch(question) &&
    !isTimeSensitiveQuestion(question)
  ) {
    const localMessage = answerPlan.category === 'religion' && !hasVerifiedLocalReligiousSource
      ? usableLocalAnswer + '\n\nℹ️ دا عمومي ځواب د آنلاین سرچینې له لارې په دې ځل نه دی تایید شوی؛ دقیقې دیني حوالې پکې نه دي اټکل شوې.'
      : usableLocalAnswer;
    await sendAnswer(socket, groupJid, { text: localMessage });
    return true;
  }

  const shouldSearchInternet =
    hasReplyContext ||
    requestsInternetSearch(question) ||
    isTimeSensitiveQuestion(question) ||
    localContextMismatch ||
    !usableLocalAnswer ||
    looksLikeQuestion(question);

  if (!looksLikeQuestion(question) && !usableLocalAnswer && !requestsInternetSearch(question) && !hasReplyContext) return false;

  if (shouldSearchInternet && ENABLE_INTERNET_SEARCH) {
    const webResults = await searchInternet(searchQuestion);
    const topicScopedResults = isTafsirYaseerAuthorshipQuestion(question)
      ? filterTafsirYaseerAuthorSources(webResults)
      : webResults;
    const answerableResults = answerPlan.category === 'religion'
      ? filterTrustedReligiousSources(topicScopedResults, question)
      : topicScopedResults;
    if (answerableResults.length) {
      const aiSummary = await summarizeSourcesInPashto(
        question, answerableResults, requiresFactualEvidence ? '' : usableLocalAnswer
      );
      if (aiSummary) {
        const answerHeading = answerableResults.length >= 2
          ? '🗺️ *د سرچینو په مرسته د افغان AI ځواب*'
          : '🗺️ *د افغان AI ځواب*';
        await sendAnswer(socket, groupJid, {
          text: answerHeading + '\n\n' + aiSummary + formatVerifiedSourceLinks(answerableResults) +
            (usableLocalAnswer && !requiresFactualEvidence
              ? '\n\n📚 *د بوټ له ثبت شوو معلوماتو څخه:* \n' + usableLocalAnswer.slice(0, 1200)
              : ''),
        });
      } else {
        await sendAnswer(socket, groupJid, {
          text: formatInternetResults(question, answerableResults) +
            (readOpenRouterApiKey()
              ? '\n\nℹ️ د AI خدمت دا ځل مفصل پښتو لنډیز ورنه کړ؛ اصلي حوالې او لنډ اقتباسونه پورته دي. لږ وروسته بیا هڅه وکړئ.'
              : '\n\nℹ️ د اتومات مفصل پښتو لنډیز لپاره په سرور کې OPENROUTER_API_KEY تنظیم کړئ. تر هغې پورې بوټ د موندل شوو سرچینو سرلیکونه او لنډ اقتباسونه ښيي.') +
            (usableLocalAnswer && !requiresFactualEvidence
              ? '\n\n📚 *د بوټ له ثبت شوو معلوماتو څخه:* \n' + usableLocalAnswer.slice(0, 900)
              : ''),
        });
      }
      return true;
    }
  }

  // که لټون پایله ورنه کړي، د عادي پوښتنې لپاره بیا هم AI ته د ځواب جوړولو اجازه ورکړه.
  // د تازه معلوماتو په موضوع کې باید د سرچینې نشتوالی په ځواب کې روښانه شي.
  if (ENABLE_AI_SUMMARIZATION && readOpenRouterApiKey()) {
    const aiAnswer = await summarizeSourcesInPashto(
      question, [], requiresFactualEvidence ? '' : usableLocalAnswer
    );
    if (aiAnswer) {
      const sourceStatusNote = requiresFactualEvidence
        ? '\n\n⚠️ *د سرچینې یادونه:* د دې ځواب لپاره معتبره آنلاین سرچینه په دې ځل ونه موندل شوه؛ پورته تشریح د عمومي پوهې پر بنسټ ده او د آنلاین تایید شوې حوالې بدیل نه ده.'
        : '';
      await sendAnswer(socket, groupJid, {
        text: '🗺️ *د افغان AI ځواب*\n\n' + aiAnswer + sourceStatusNote,
      });
      return true;
    }
  }

  if (usableLocalAnswer && !requiresFactualEvidence) {
    const message = isTimeSensitiveQuestion(question)
      ? usableLocalAnswer + '\n\n⚠️ دا ځل انټرنېټي سرچینو نتیجه ورنه کړه؛ د تازه معلوماتو لپاره د سرچینې نېټه جلا وګورئ.'
      : usableLocalAnswer;
    await sendAnswer(socket, groupJid, { text: message });
    return true;
  }

  if (!looksLikeQuestion(question) && !requestsInternetSearch(question) && !hasReplyContext) return false;

  const aiKeyConfigured = Boolean(readOpenRouterApiKey());
  const isReligiousQuestion = answerPlan.category === 'religion';
  const fallbackText = requiresFactualEvidence
    ? '📚 دا ځل د دې تاریخي، سیاسي یا علمي پوښتنې لپاره کافي معتبرې سرچینې ونه موندل شوې؛ نو بې‌سنده ادعا د تایید شوي حقیقت په توګه نه وړاندې کوم. یوه رسمي، پوهنتوني، علمي یا باوري خبري سرچینه شریکه کړئ، یا وروسته بیا هڅه وکړئ.'
    : isTafsirYaseerAuthorshipQuestion(question)
    ? '📚 د «تفسیر یسیر» د لیکوال نوم مې دا ځل په داسې باوري سرچینه کې ونه شو تاییدولای چې همدا کتاب او لیکوال په څرګنده یاد کړي؛ نو د ناسم نوم له اټکل کولو ډډه کوم.'
    : isReligiousQuestion
    ? '📚 د دې دیني پوښتنې لپاره له باوري، اړوندې دیني یا علمي سرچینې څخه کافي شواهد ترلاسه نه شول. د ناسم آیت، حدیث، روایت، فتوا یا شرعي حکم د جوړولو پر ځای ځواب نه اټکلم. که د قرآن، حدیث، معتبر کتاب یا پېژندل شوې مرجع لینک راولېږئ، د هماغې سرچینې له مخې یې تشریح کوم.'
    : aiKeyConfigured
    ? '📚 دا ځل د پوښتنې لپاره د تایید وړ معلومات نه شول ترلاسه کېدای؛ د انټرنېټ لټون یا د AI ځواب جوړول ناکام شول. لږ وروسته یې بیا وپوښتئ، یا د موضوع رسمي/معتبر لینک راولېږئ. د تخنیکي تشخیص لپاره د SillyDev لاګونه وګورئ.'
    : '📚 د پوښتنې لپاره باوري سرچینه پیدا نه شوه او د AI کیلي هم تنظیم شوې نه ده. د پروژې مدیر دې په SillyDev کې د OPENROUTER_API_KEY شتون او د /health په راپور کې aiSummarization وګوري.';
  await sendAnswer(socket, groupJid, {
    text: isReligiousQuestion ? fallbackText : fallbackText + '\n\n⚠️ تر تایید شوې سرچینې پرته د ناسم ځواب له جوړولو ډډه کوم. پوښتنه بیا هڅه کړئ یا یوه باوري سرچینه ورسره شریک کړئ.'
  });
  return true;
}

}

module.exports = { createAnswerEngine };
