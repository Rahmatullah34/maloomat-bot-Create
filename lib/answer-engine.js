'use strict';

const { formatWhatsAppText } = require('./whatsapp-format');

const {
  isRestrictedPoliticalTopic,
  RESTRICTED_POLITICAL_REPLY,
} = require('./restricted-political-topic');

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

  return async function answerWithKnowledge(socket, groupJid, participantJid, question, participantName, replyContext = null) {
  const sendAnswer = (targetSocket, targetJid, payload) => {
    const formattedPayload = payload && typeof payload.text === 'string'
      ? { ...payload, text: formatWhatsAppText(payload.text) }
      : payload;

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
      return safeSend(targetSocket, targetJid, answerPayload, { quoted: replyContext.message });
    }
    return safeSend(targetSocket, targetJid, formattedPayload);
  };
  // د پوښتنو ځوابونه فعال دي؛ د ګروپ نظم/منځپانګې کنټرولونه جلا ساتل شوي دي.
  if (!ENABLE_GROUP_QA) return false;

  // بوټ یوازې واضح پوښتنو یا ښکاره انټرنېټي لټون غوښتنو ته ځواب ورکوي.
  // عادي معلوماتي پوسټونه او هغه متنونه چې یوازې یوه کلیدي کلمه لري، بې‌ځوابه پرېږدي.
  if (!looksLikeQuestion(question)) {
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

  // Keep verified Quran text intact, but still perform source lookup before replying.
  const verifiedQuranTextAnswer = buildVerifiedQuranLongestWordAnswer(question);

  const identityAnswer = answerIdentityQuestion(
    groupJid, participantJid, participantName, question
  );
  if (identityAnswer) {
    await sendAnswer(socket, groupJid, { text: identityAnswer });
    return true;
  }

  const answerPlan = buildAnswerPlan(question);
  const requiresFactualEvidence = requiresFactualSourceEvidence(question, answerPlan.category);
  // Even deterministic/common/local answers now go through source search first.
  // They remain a transparent fallback only when no relevant web evidence is found.
  const localAnswer = verifiedQuranTextAnswer ||
    answerFromOfflineKnowledge(question) ||
    answerSimpleMathQuestion(question) ||
    answerCommonPashtoQuestion(question);
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

  // Every factual question gets a relevant-source search before any local/AI fallback.
  const shouldSearchInternet = looksLikeQuestion(question) || requestsInternetSearch(question);

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
      if (verifiedQuranTextAnswer) {
        await sendAnswer(socket, groupJid, {
          text: '🗺️ *د سرچینو په مرسته د افغان AI ځواب*\n\n' +
            verifiedQuranTextAnswer + formatVerifiedSourceLinks(answerableResults),
        });
        return true;
      }
      const aiSummary = await summarizeSourcesInPashto(
        question, answerableResults, requiresFactualEvidence ? '' : usableLocalAnswer
      );
      if (aiSummary) {
        const answerHeading = '🗺️ *د سرچینو په مرسته د افغان AI ځواب*';
        await sendAnswer(socket, groupJid, {
          text: answerHeading + '\n\n' + aiSummary + formatVerifiedSourceLinks(answerableResults) +
            (usableLocalAnswer
              ? '\n\n📚 *د بوټ له معلوماتي زېرمې څخه (آنلاین نه دی تایید شوی):* \n' +
                usableLocalAnswer.slice(0, 1200) +
                '\n⚠️ د دقیق شمېر، نېټې یا ځانګړي نسبت په توګه یې تر خپلواکې تایید مخکې مه منئ.'
              : ''),
        });
      } else {
        await sendAnswer(socket, groupJid, {
          text: formatInternetResults(question, answerableResults) +
            (readOpenRouterApiKey()
              ? '\n\nℹ️ د AI خدمت دا ځل مفصل پښتو لنډیز ورنه کړ؛ اصلي حوالې او لنډ اقتباسونه پورته دي. لږ وروسته بیا هڅه وکړئ.'
              : '\n\nℹ️ د اتومات مفصل پښتو لنډیز لپاره په سرور کې OPENROUTER_API_KEY تنظیم کړئ. تر هغې پورې بوټ د موندل شوو سرچینو سرلیکونه او لنډ اقتباسونه ښيي.') +
            (usableLocalAnswer
              ? '\n\n📚 *د بوټ له معلوماتي زېرمې څخه (آنلاین نه دی تایید شوی):* \n' +
                usableLocalAnswer.slice(0, 900) +
                '\n⚠️ د دقیق شمېر، نېټې یا ځانګړي نسبت په توګه یې تر خپلواکې تایید مخکې مه منئ.'
              : ''),
        });
      }
      return true;
    }
  }

  // A verified Quran text is kept verbatim when online search has no usable result.
  if (verifiedQuranTextAnswer) {
    await sendAnswer(socket, groupJid, {
      text: verifiedQuranTextAnswer +
        '\n\n⚠️ *د سرچینې یادونه:* د انټرنېټ لټون دا ځل بله اړونده سرچینه راونه موندله؛ عربي متن د بوټ له مخکې تایید شوي مصحفي متن څخه اخیستل شوی.',
    });
    return true;
  }

  // که لټون پایله ورنه کړي، د عادي پوښتنې لپاره بیا هم AI ته د ځواب جوړولو اجازه ورکړه.
  // د تازه معلوماتو په موضوع کې باید د سرچینې نشتوالی په ځواب کې روښانه شي.
  if (ENABLE_AI_SUMMARIZATION && readOpenRouterApiKey()) {
    const aiAnswer = await summarizeSourcesInPashto(
      question, [], requiresFactualEvidence ? '' : usableLocalAnswer
    );
    if (aiAnswer) {
      const sourceStatusNote = requiresFactualEvidence
        ? '\n\n⚠️ *د سرچینې یادونه:* د دې ځواب لپاره اړونده معتبره آنلاین سرچینه په دې ځل ونه موندل شوه؛ پورته تشریح د عمومي پوهې پر بنسټ ده او د آنلاین تایید شوې حوالې بدیل نه ده.'
        : '\n\n⚠️ *د سرچینې یادونه:* د دې پوښتنې لپاره په دې ځل اړوندې آنلاین سرچینې ونه موندل شوې؛ پورته ځواب د عمومي پوهې پر بنسټ دی، د ویب له لارې تایید شوی نه دی.';
      await sendAnswer(socket, groupJid, {
        text: '🗺️ *د افغان AI ځواب*\n\n' + aiAnswer + sourceStatusNote,
      });
      return true;
    }
  }

  if (usableLocalAnswer) {
    const message = usableLocalAnswer +
      '\n\n⚠️ *د سرچینې یادونه:* په دې ځل د دې پوښتنې لپاره اړوندې باوري آنلاین سرچینې یا د AI تایید شوی لنډیز ترلاسه نه شو. پورته معلومات د بوټ د محلي زېرمې/عمومي پوهې پر بنسټ دي؛ د دقیق شمېر، نېټې یا ځانګړي نسبت په توګه یې تر خپلواکې تایید مخکې مه منئ.';
    await sendAnswer(socket, groupJid, { text: message });
    return true;
  }

  if (!looksLikeQuestion(question) && !requestsInternetSearch(question)) return false;

  const aiKeyConfigured = Boolean(readOpenRouterApiKey());
  const isReligiousQuestion = answerPlan.category === 'religion';
  const fallbackText = isTafsirYaseerAuthorshipQuestion(question)
    ? '📚 د «تفسیر یسیر» د لیکوال نوم مې په باوري سرچینه کې تایید نه کړ؛ نو نوم نه اټکلم. د کتاب په اړه عمومي معلومات درکولای شم، خو د لیکوال کره نوم باید د کتاب له سرپاڼې یا باوري کتابتون څخه تایید شي.'
    : isReligiousQuestion
    ? '📚 د دې دیني پوښتنې لپاره اړوند باوري ماخذ ترلاسه نه شو. عمومي تشریح درکوم، خو دقیق آیت، حدیث، سند، درجه یا فتوا بې له تایید شوې حوالې نه منسوبوم. د پوښتنې هغه برخې چې کره حواله غواړي، لا تایید ته اړتیا لري.'
    : requiresFactualEvidence
    ? '📚 ستاسې پوښتنه مې ترلاسه کړه. په دې ځل د موضوع اړوند معتبره سرچینه ونه موندل شوه او د AI خدمت هم ځواب بشپړ نه کړ؛ نو د دقیق شمېر، نېټې یا ځانګړې ادعا اټکل نه کوم. عمومي اصل دا دی چې دا ډول معلومات باید د اړوندې رسمي ادارې، علمي بنسټ یا باوري خپرونې له تازه لېست سره پرتله شي.'
    : aiKeyConfigured
    ? '📚 ستاسې پوښتنه مې ترلاسه کړه، خو په دې ځل ویب لټون او د AI ځواب جوړولو خدمت بشپړ ځواب رانه کړ. د ناسم معلوماتو د مخنیوي لپاره اټکلي ادعا نه جوړوم؛ پوښتنه په لږو مشخصو ټکو بیا ولیکئ یا اړوند سند/لینک راولېږئ.'
    : '📚 ستاسې پوښتنه مې ترلاسه کړه، خو د ویب لټون پایله او د AI خدمت دواړه اوس نه دي فعال/چمتو شوي. د ځواب د جوړولو لپاره په SillyDev کې OPENROUTER_API_KEY او د /health په راپور کې aiSummarization وګورئ. تر هغې پورې کره جزئیات نه اټکلم.';
  await sendAnswer(socket, groupJid, {
    text: isReligiousQuestion ? fallbackText : fallbackText + '\n\n⚠️ تر تایید شوې سرچینې پرته د ناسم ځواب له جوړولو ډډه کوم. پوښتنه بیا هڅه کړئ یا یوه باوري سرچینه ورسره شریک کړئ.'
  });
  return true;
}

}

module.exports = { createAnswerEngine };
