'use strict';

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
  } = dependencies;

  if (!dependencies || typeof safeSend !== 'function' || typeof searchInternet !== 'function') {
    throw new TypeError('createAnswerEngine requires safeSend and searchInternet dependencies');
  }

  return async function answerWithKnowledge(socket, groupJid, participantJid, question, participantName) {
  // د پوښتنو ځوابونه فعال دي؛ د ګروپ نظم/منځپانګې کنټرولونه جلا ساتل شوي دي.
  if (!ENABLE_GROUP_QA) return false;

  // بوټ یوازې واضح پوښتنو یا ښکاره انټرنېټي لټون غوښتنو ته ځواب ورکوي.
  // عادي معلوماتي پوسټونه او هغه متنونه چې یوازې یوه کلیدي کلمه لري، بې‌ځوابه پرېږدي.
  if (!looksLikeQuestion(question)) {
    return false;
  }

  // د هر ډول انټرنېټي لټون یا AI لنډیز تر مخه د محرمیت او زیان اړوند غوښتنې ودرول شي.
  if (isSensitiveSafetyRequest(question)) {
    await safeSend(socket, groupJid, {
      text: '🛡️ د خلکو د شخصي پتې، شخصي شمېرې، دقیق ځای، تعقیب یا زیان رسولو لپاره معلومات نه شم برابرولای.\n\n' +
        '🌐 که پوښتنه عمومي یا سیاسي وي، کولای شم بې‌طرفه، عامه او د باوري سرچینو پر بنسټ معلومات وړاندې کړم.'
    });
    return true;
  }

  // د قرآن د اوږدې کلمې عربي بڼه له مستند مصحفي متن څخه مستقیمه ورکوو؛ AI ته یې له حافظې د بیا لیکلو اړتیا نه پرېږدو.
  const verifiedQuranTextAnswer = buildVerifiedQuranLongestWordAnswer(question);
  if (verifiedQuranTextAnswer) {
    await safeSend(socket, groupJid, { text: verifiedQuranTextAnswer });
    return true;
  }

  const mathAnswer = answerSimpleMathQuestion(question);
  if (mathAnswer) {
    await safeSend(socket, groupJid, { text: mathAnswer });
    return true;
  }

  const commonAnswer = answerCommonPashtoQuestion(question);
  if (commonAnswer) {
    await safeSend(socket, groupJid, { text: commonAnswer });
    return true;
  }

  const identityAnswer = answerIdentityQuestion(
    groupJid, participantJid, participantName, question
  );
  if (identityAnswer) {
    await safeSend(socket, groupJid, { text: identityAnswer });
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
    await safeSend(socket, groupJid, { text: localMessage });
    return true;
  }

  const shouldSearchInternet =
    requestsInternetSearch(question) ||
    isTimeSensitiveQuestion(question) ||
    localContextMismatch ||
    !usableLocalAnswer ||
    looksLikeQuestion(question);

  if (!looksLikeQuestion(question) && !usableLocalAnswer && !requestsInternetSearch(question)) return false;

  if (shouldSearchInternet && ENABLE_INTERNET_SEARCH) {
    const webResults = await searchInternet(question);
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
        await safeSend(socket, groupJid, {
          text: answerHeading + '\n\n' + aiSummary + formatVerifiedSourceLinks(answerableResults) +
            (usableLocalAnswer && !requiresFactualEvidence
              ? '\n\n📚 *د بوټ له ثبت شوو معلوماتو څخه:* \n' + usableLocalAnswer.slice(0, 1200)
              : ''),
        });
      } else {
        await safeSend(socket, groupJid, {
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
      await safeSend(socket, groupJid, { text: '🗺️ *د افغان AI ځواب*\n\n' + aiAnswer });
      return true;
    }
  }

  if (usableLocalAnswer && !requiresFactualEvidence) {
    const message = isTimeSensitiveQuestion(question)
      ? usableLocalAnswer + '\n\n⚠️ دا ځل انټرنېټي سرچینو نتیجه ورنه کړه؛ د تازه معلوماتو لپاره د سرچینې نېټه جلا وګورئ.'
      : usableLocalAnswer;
    await safeSend(socket, groupJid, { text: message });
    return true;
  }

  if (!looksLikeQuestion(question) && !requestsInternetSearch(question)) return false;

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
  await safeSend(socket, groupJid, {
    text: isReligiousQuestion ? fallbackText : fallbackText + '\n\n⚠️ تر تایید شوې سرچینې پرته د ناسم ځواب له جوړولو ډډه کوم. پوښتنه بیا هڅه کړئ یا یوه باوري سرچینه ورسره شریک کړئ.'
  });
  return true;
}

}

module.exports = { createAnswerEngine };
