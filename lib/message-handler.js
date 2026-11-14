'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isImageMessage } = require('./image-question');

function hasTerminalQuestionMark(value) {
  const text = String(value || '').trimEnd();
  return /[؟?？﹖]+$/u.test(text);
}

function normalizePrivateLid(jid) {
  if (typeof jid !== 'string' || !/@lid$/iu.test(jid)) return '';
  return jid.split('@')[0].split(':')[0].replace(/\D/g, '');
}

function persistOwnerLidAllowlist(lidDigits) {
  if (!/^\d{5,25}$/.test(String(lidDigits || ''))) {
    throw new Error('Invalid owner LID format');
  }
  if (String(process.env.PRIVATE_QA_ALLOWED_LIDS || '').trim()) {
    throw new Error('Clear PRIVATE_QA_ALLOWED_LIDS from Environment so the private file can persist the owner LID');
  }

  const configPath = path.resolve(process.cwd(), 'private-runtime-config.json');
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('Private runtime config must be a JSON object');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const existing = String(config.PRIVATE_QA_ALLOWED_LIDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (!existing.includes(lidDigits)) existing.push(lidDigits);

  config.PRIVATE_QA_ALLOWED_LIDS = existing.join(',');
  config.PRIVATE_QA_OWNER_CLAIM_CODE = '';
  config.PRIVATE_QA_OWNER_CLAIMED = 'true';

  const temporaryPath = configPath + '.tmp';
  fs.writeFileSync(temporaryPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporaryPath, configPath);
}

function normalizeExemptPhone(value) {
  const raw = String(value || '').replace(/[۰-۹٠-٩]/gu, (digit) => ({
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  })[digit] || digit).trim();
  if (!raw || /@lid$/iu.test(raw)) return '';
  const numberPart = raw.includes('@') ? raw.split('@')[0].split(':')[0] : raw;
  let digits = numberPart.replace(/\D/g, '');
  if (digits.startsWith('93') && digits.length === 11) digits = '0' + digits.slice(2);
  if (digits.length === 9) digits = '0' + digits;
  return /^\d{10,15}$/.test(digits) ? digits : '';
}

function persistModerationExemptPhoneNumbersToFile(phoneNumbers) {
  if (String(process.env.FULL_MODERATION_EXEMPT_PHONE_NUMBERS || '').trim()) {
    throw new Error('Clear FULL_MODERATION_EXEMPT_PHONE_NUMBERS from Environment to persist group-admin exemptions in the private file');
  }

  const normalized = [...new Set((Array.isArray(phoneNumbers) ? phoneNumbers : [phoneNumbers])
    .map(normalizeExemptPhone)
    .filter(Boolean))];
  if (!normalized.length) throw new Error('No valid moderation exemption phone number was supplied');

  const configPath = path.resolve(process.cwd(), 'private-runtime-config.json');
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('Private runtime config must be a JSON object');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const existing = String(config.FULL_MODERATION_EXEMPT_PHONE_NUMBERS || '')
    .split(',')
    .map(normalizeExemptPhone)
    .filter(Boolean);
  config.FULL_MODERATION_EXEMPT_PHONE_NUMBERS = [...new Set([...existing, ...normalized])].join(',');

  const temporaryPath = configPath + '.tmp';
  fs.writeFileSync(temporaryPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporaryPath, configPath);
  return normalized;
}

function findQuotedMessage(messageContent) {
  const queue = [messageContent];
  const visited = new Set();

  while (queue.length && visited.size < 80) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);

    const contextInfo = current.contextInfo;
    if (contextInfo?.quotedMessage && typeof contextInfo.quotedMessage === 'object') {
      return contextInfo.quotedMessage;
    }

    for (const [key, value] of Object.entries(current)) {
      if (key === 'quotedMessage') continue;
      if (value && typeof value === 'object') queue.push(value);
    }
  }

  return null;
}

function extractQuotedMessageText(messageContent, extractTextFn) {
  const quotedMessage = findQuotedMessage(messageContent);
  if (!quotedMessage || typeof extractTextFn !== 'function') return '';
  return String(extractTextFn(quotedMessage) || '').trim().slice(0, 1800);
}

function createMessageHandler(dependencies) {
  const {
    socket,
    shouldHandleNotifyEvent,
    classifyRemoteJid,
    isReactionMessage,
    isStickerMessage = () => false,
    ENABLE_PRIVATE_QA,
    PRIVATE_QA_ALLOWED_NUMBERS,
    PRIVATE_QA_ALLOWED_LIDS,
    PRIVATE_QA_OWNER_CLAIM_CODE,
    PRIVATE_QA_OWNER_CLAIMED,
    persistPrivateOwnerLid = persistOwnerLidAllowlist,
    persistModerationExemptPhoneNumbers: persistModerationExemptPhones = persistModerationExemptPhoneNumbersToFile,
    FULL_MODERATION_EXEMPT_PHONE_NUMBER,
    FULL_MODERATION_EXEMPT_PHONE_NUMBERS = new Set(),
    GROUP_REJOIN_APPROVER_PHONE = '',
    groupRejoinControl = null,
    hasMatchingPhoneNumber = null,
    BOT_PHONE_NUMBER = '',
    rememberMessage,
    extractText,
    extractQuestionFromImage,
    safeSend,
    answerWithKnowledge,
    isGroupAllowed,
    isForwardedChannelMessage,
    isWhatsAppStatusShare,
    isGroupRulesCommand,
    GROUP_RULES,
    resolveGroupSender,
    isFullModerationExemptSender,
    WARNING_MUTE_ENABLED,
    getTemporaryMuteStatus,
    deleteGroupMessage,
    recordGroupMessage,
    BURST_LIMIT,
    containsBadWord,
    ENABLE_LINK_MODERATION,
    LINK_PATTERN,
    isLinkPermittedForSender,
    recordRepeatedMessage,
    rememberGroupMember,
    handleEnglishCourseCommand = null,
  } = dependencies || {};

  if (!socket?.ev || typeof shouldHandleNotifyEvent !== 'function' ||
      typeof answerWithKnowledge !== 'function' || typeof safeSend !== 'function') {
    throw new TypeError('createMessageHandler requires a socket, router, answer engine, and safeSend');
  }

  let privateOwnerLidClaimConsumed = Boolean(PRIVATE_QA_OWNER_CLAIMED);

  return async function handleMessagesUpsert(event) {
        const messages =
          Array.isArray(event?.messages)
            ? event.messages
            : [];

        if (event?.type !== 'notify') {
          return;
        }

        for (const msg of messages) {
          try {
            if (!shouldHandleNotifyEvent(event?.type, msg)) {
              continue;
            }

            // لایکونه/غبرګونونه عادي پیغامونه نه دي؛ د سپم شمېر او اخطار څخه یې وباسه.
            if (isReactionMessage(msg.message)) {
              console.log('❤️ د WhatsApp غبرګون/لایک له نظم ساتنې او اخطارونو مستثنا شو.');
              continue;
            }

            const groupJid =
              msg.key?.remoteJid;

            const chatType = classifyRemoteJid(groupJid);
            if (chatType === 'ignore') {
              continue;
            }

            // شخصي چټ جلا اداره کېږي؛ د ګروپ د مدیریت قواعد نه پرې تطبیقېږي.
            if (chatType === 'private') {
              const privateOwnerNumber = String(FULL_MODERATION_EXEMPT_PHONE_NUMBER || '').replace(/\D/g, '');
              const privateCaption = extractText(msg.message);
              const hasSingleAuthorizedOwner = Boolean(
                privateOwnerNumber.length >= 7 &&
                PRIVATE_QA_ALLOWED_NUMBERS instanceof Set &&
                PRIVATE_QA_ALLOWED_NUMBERS.size === 1 &&
                PRIVATE_QA_ALLOWED_NUMBERS.has(privateOwnerNumber)
              );
              if (!ENABLE_PRIVATE_QA || !hasSingleAuthorizedOwner) {
                if (ENABLE_PRIVATE_QA && !hasSingleAuthorizedOwner) {
                  console.warn('🔒 شخصي چټ بند پاتې دی: باید یوازې د مالک یوه شمېره په PRIVATE_QA_ALLOWED_NUMBERS کې وي او له FULL_MODERATION_EXEMPT_PHONE_NUMBER سره برابره وي.');
                }
                continue;
              }

              // شخصي ځوابونه یوازې د مالک شمېرې یا په څرګند ډول ثبت شوي مالک LID ته اجازه لري.
              const privateSenderJids = [
                groupJid,
                msg.key?.remoteJidAlt,
                msg.key?.participant,
                msg.key?.participantAlt,
              ].filter(Boolean);

              // Explicit private-chat identity helper: reveal only identifiers attached
              // to this sender's own direct message, never log them or answer the question.
              const isPermittedPrivatePhoneJid = (jid) => {
                if (
                  typeof jid !== 'string' ||
                  !/@(?:s\.whatsapp\.net|c\.us)$/.test(jid)
                ) {
                  return false;
                }
                const digits = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
                return digits === privateOwnerNumber && PRIVATE_QA_ALLOWED_NUMBERS.has(privateOwnerNumber);
              };

              // LID یوازې هغه وخت منل کېږي چې د مالک د یوازینۍ مجازې شمېرې ترڅنګ په څرګند ډول ثبت شوی وي.
              const isPermittedPrivateLidJid = (jid) => {
                const lidDigits = normalizePrivateLid(jid);
                return Boolean(
                  lidDigits &&
                  PRIVATE_QA_ALLOWED_LIDS instanceof Set &&
                  PRIVATE_QA_ALLOWED_LIDS.has(lidDigits)
                );
              };

              let isAuthorizedPrivateSender =
                privateSenderJids.some(isPermittedPrivatePhoneJid) ||
                privateSenderJids.some(isPermittedPrivateLidJid);

              // د لومړي ځل لپاره مالک کولای شي یو ځلنی پټ کوډ واستوي؛ یوازې همدا LID ثبتېږي.
              const claimCode = String(PRIVATE_QA_OWNER_CLAIM_CODE || '').trim();
              const candidateClaim = String(privateCaption || '').trim().toUpperCase();
              if (
                !isAuthorizedPrivateSender &&
                !privateOwnerLidClaimConsumed &&
                claimCode.length >= 20 &&
                candidateClaim === claimCode.toUpperCase() &&
                String(groupJid || '').endsWith('@lid')
              ) {
                const lidDigits = normalizePrivateLid(groupJid);
                try {
                  await persistPrivateOwnerLid(lidDigits);
                  if (!(PRIVATE_QA_ALLOWED_LIDS instanceof Set)) {
                    throw new Error('Owner LID allowlist is unavailable');
                  }
                  PRIVATE_QA_ALLOWED_LIDS.add(lidDigits);
                  privateOwnerLidClaimConsumed = true;
                  console.log('🔐 د مالک شخصي LID په محلي محرم تنظیماتو کې ثبت شو؛ یو ځلنی کوډ مصرف شو.');
                  await safeSend(socket, groupJid, {
                    text: '✅ ستا شخصي چټ د مالک حساب لپاره فعال شو. اوس خپلې پوښتنې دلته مستقیمې راولېږه. د تایید کوډ نور کار نه کوي.',
                  });
                  continue;
                } catch (err) {
                  console.error('❌ د مالک LID ثبت ناکام شو:', err?.message || err);
                  await safeSend(socket, groupJid, {
                    text: '⚠️ د مالک پېژندنه تایید شوه، خو خوندي ثبت ناکام شو. د SillyDev محلي private-runtime-config.json او PRIVATE_QA_ALLOWED_LIDS تنظیم وګوره.',
                  });
                  continue;
                }
              }

              // که LID په ځانګړي اجازه‌لیست کې نه وي، د Baileys له محلي نقشې د PN موندلو هڅه وکړه.
              // نامعلوم LID ته په خپله اجازه نه ورکول کېږي.
              if (
                !isAuthorizedPrivateSender &&
                typeof socket.signalRepository?.lidMapping?.getPNForLID === 'function'
              ) {
                const lidJids = [
                  ...new Set(
                    privateSenderJids.filter(
                      (jid) => typeof jid === 'string' && /@lid$/.test(jid)
                    )
                  ),
                ];

                for (const lidJid of lidJids) {
                  try {
                    const mappedPhoneJid =
                      await socket.signalRepository.lidMapping.getPNForLID(lidJid);
                    if (isPermittedPrivatePhoneJid(mappedPhoneJid)) {
                      isAuthorizedPrivateSender = true;
                      break;
                    }
                  } catch (err) {
                    console.warn(
                      '⚠️ د شخصي چټ د LID پېژندنې ستونزه:',
                      err?.message || err
                    );
                  }
                }
              }

              if (!isAuthorizedPrivateSender) {
                const lidMappingAvailable =
                  typeof socket.signalRepository?.lidMapping?.getPNForLID === 'function';
                let lidMappingFound = false;
                if (groupJid.endsWith('@lid') && lidMappingAvailable) {
                  try {
                    const mapped = await socket.signalRepository.lidMapping.getPNForLID(groupJid);
                    lidMappingFound = Boolean(mapped);
                  } catch (err) {
                    console.warn('⚠️ د LID نقشې لوستل ناکام شول:', err?.message || err);
                  }
                }
                const phoneIdSeen = privateSenderJids.some(
                  (jid) => typeof jid === 'string' && /@(?:s\.whatsapp\.net|c\.us)$/iu.test(jid)
                );
                const lidIdSeen = privateSenderJids.some(
                  (jid) => typeof jid === 'string' && /@lid$/iu.test(jid)
                );
                console.log(
                  '🔒 شخصي پیغام رد شو؛ یوازې د مالک شمېره منل کېږي؛ ' +
                  'د نقشې وسیله=' + (lidMappingAvailable ? 'شته' : 'نه شته') +
                  '; نقشه موندل شوې=' + (lidMappingFound ? 'هو' : 'نه') +
                  '; د مجازې شمېرې شمېر=' + PRIVATE_QA_ALLOWED_NUMBERS.size +
                  '; د مالک د مجاز LID شمېر=' + (PRIVATE_QA_ALLOWED_LIDS instanceof Set ? PRIVATE_QA_ALLOWED_LIDS.size : 0) +
                  '; د یو ځلني تایید کوډ فعال=' + (claimCode.length >= 20 && !privateOwnerLidClaimConsumed ? 'هو' : 'نه') +
                  '; د پیغام د پېژندنې ډول=' + (phoneIdSeen && lidIdSeen ? 'PN+LID' : lidIdSeen ? 'LID' : phoneIdSeen ? 'PN' : 'ناڅرګند') + '.'
                );
                continue;
              }

              const privateMessageId = msg.key?.id;
              if (
                privateMessageId &&
                !rememberMessage(groupJid + ':' + privateMessageId)
              ) {
                continue;
              }

              const privateText = typeof extractQuestionFromImage === 'function'
                ? await extractQuestionFromImage(msg, socket, privateCaption)
                : privateCaption;
              const privateLower = String(privateText || '').toLowerCase().trim();
              const privateGreetings = [
                'سلام',
                'السلام علیکم',
                'السلامعلیکم',
                'salam',
                'hello',
                'hi',
                'وعلیکم السلام',
              ];
              const isPrivateGreeting = String(privateText || '').trim().length <= 60 &&
                privateGreetings.some((greeting) => privateLower.startsWith(greeting));

              if (
                !String(privateText || '').trim() ||
                (!hasTerminalQuestionMark(privateText) && !isPrivateGreeting)
              ) {
                // عادي شخصي پیغام لا هم یوازې د پای پوښتنیزې نښې په صورت کې ځوابېږي؛ سلام جلا استثنا ده.
                continue;
              }

              const privateQuotedText = extractQuotedMessageText(msg.message, extractText);
              const privateReplyContext = privateQuotedText
                ? { message: msg, quotedText: privateQuotedText }
                : null;

              const privateParticipantJid =
                msg.key?.participant ||
                msg.key?.participantAlt ||
                groupJid;

              const privateRawName =
                msg.pushName ||
                String(privateParticipantJid).split('@')[0] ||
                'ملګری';

              const privateName = String(privateRawName)
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .trim()
                .slice(0, 80) || 'ملګری';

              console.log(
                '📩 شخصي پیغام پروسس کېږي؛ د متن اوږدوالی=' + privateText.length
              );

              if (isPrivateGreeting) {
                await safeSend(socket, groupJid, {
                  text:
                    '🌍 وعلیکم السلام ورحمة الله وبرکاته، قدرمن ' + privateName + ' جانه! 🌸\n\n' +
                    '🌐 زه د Maloomat AI | معلومات AI مرستیال یم. 💐\n' +
                    '📚 خپله پوښتنه په پښتو، دري یا انګلیسي ژبه ولیکئ؛ هڅه کوم چې کره معلومات او ګټور ځواب درکړم.\n' +
                    '✨ هیله ده زموږ معلوماتي خدمتونه درته ګټور تمام شي!',
                });
                continue;
              }

              await answerWithKnowledge(
                socket,
                groupJid,
                privateParticipantJid,
                privateText,
                privateName,
                privateReplyContext
              );
              continue;
            }

            // که د اجازې لرونکو ګروپونو لېست ټاکل شوی وي، یوازې هلته کار کوو.
            if (!isGroupAllowed(groupJid)) {
              continue;
            }

            const messageId = msg.key?.id;

            if (
              messageId &&
              !rememberMessage(
                `${groupJid}:${messageId}`
              )
            ) {
              continue;
            }

            const messageCaption = extractText(msg.message);
            // Status او Channel metadata تر OCR او د بې‌متنه عکس د skip شرطه مخکې وپېژنه.
            // ځینې شریک شوي Status عکسونه کپشن نه لري؛ پخوانی ترتیب یې د حذف له شرطه مخکې پرېښودل.
            const channelForward = isForwardedChannelMessage(msg);
            const statusShare = isWhatsAppStatusShare(msg);

            if (
              !statusShare &&
              (msg.message?.imageMessage || msg.message?.videoMessage)
            ) {
              const mediaContext =
                msg.message?.imageMessage?.contextInfo ||
                msg.message?.videoMessage?.contextInfo ||
                {};
              const preview = mediaContext.externalAdReply || {};
              const previewLabelIsStatus = [preview.title, preview.body]
                .some((label) => {
                  const value = String(label || '').trim().replace(/\s+/gu, ' ');
                  return /^(?:whatsapp\s+)?status(?:\s*\(\d{1,2}:\d{2}\))?$/iu.test(value) ||
                    /[•·|]\s*(?:whatsapp\s+)?status(?:\s*\(\d{1,2}:\d{2}\))?\s*$/iu.test(value);
                });
              console.log(
                '🔎 [STATUS-CHECK] کارت د Status په توګه ونه پېژندل شو؛ ډول=' +
                Object.keys(msg.message || {}).slice(0, 6).join(',') +
                '؛ contextKeys=' + Object.keys(mediaContext).slice(0, 12).join(',') +
                '؛ forwarded=' + Boolean(mediaContext.isForwarded) +
                '؛ previewStatus=' + previewLabelIsStatus +
                '؛ statusAttributions=' +
                (Array.isArray(mediaContext.statusAttributions) && mediaContext.statusAttributions.length > 0)
              );
            }

            // یوازې سټیکر د سپم شمېر نه زیاتوي؛ خو که په همدې پیغام کې Status/Channel
            // metadata هم وي، د شریک شوي پوسټ د حذف لومړیتوب ساتل کېږي.
            if (
              typeof isStickerMessage === 'function' &&
              isStickerMessage(msg.message) &&
              !channelForward &&
              !statusShare
            ) {
              console.log('ℹ️ یوازې سټیکر د ګروپ د سپم شمېر او AI ځواب څخه مستثنا شو.');
              continue;
            }

            // د منع شوي Status/Channel پوسټ لپاره د عکس OCR ته اړتیا نشته؛ مستقیم حذف یې وارزوه.
            const text = channelForward || statusShare
              ? messageCaption
              : typeof extractQuestionFromImage === 'function'
                ? await extractQuestionFromImage(msg, socket, messageCaption)
                : messageCaption;

            if (!text.trim() && isImageMessage(msg.message) && !channelForward && !statusShare) {
              // عادي عکسونه او هغه عکسونه چې پکې پوښتنه/تمرین ونه موندل شي،
              // په ګروپ کې بې‌ځوابه پرېږده؛ د عادي عکس لپاره خبرتیا مه لېږه.
              console.log('ℹ️ د ګروپ عکس کې د ځواب وړ پوښتنه یا تمرین ونه موندل شو؛ پیغام بې‌ځوابه پرېښودل شو.');
              continue;
            }

            // بې‌متنه عکسونه، غږیز او نور پیغامونه هم د چټک سپم په شمېر کې حسابېږي؛
            // یوازې د متن د نشتوالي له امله یې د مدیریت کتنه مه پرېږده.

            const participantJid =
              msg.key?.participant ||
              msg.key?.participantAlt ||
              'unknown-member';

            const rawName =
              msg.pushName ||
              String(participantJid).split('@')[0] ||
              'ملګری';

            const name = String(rawName)
              .replace(
                /[\u200B-\u200D\uFEFF]/g,
                ''
              )
              .trim()
              .slice(0, 80) || 'ملګری';

            const lower =
              text.toLowerCase().trim();

            const cleanText = lower
              .replace(/[!.؟?،,]/g, '')
              .trim();

            // د قوانینو امر د سپم شمېر، کنځلو او لینک مدیریت تر مخه اجرا کړه؛
            // د پښتو/عربي «ی» توپیر او د جملې پای نښې د ځواب مخه نه نیسي.
            if (isGroupRulesCommand(text)) {
              console.log('📜 د ګروپ قوانینو غوښتنه پېژندل شوه؛ غړی=' + name);
              await safeSend(socket, groupJid, {
                text: `📜 محترم ${name} جانه!\n\n` + GROUP_RULES,
              });
              continue;
            }

            console.log(
              '📩 ګروپي پیغام پروسس کېږي؛ د متن اوږدوالی=' + text.length +
              '؛ متن شته=' + (text.trim() ? 'هو' : 'نه')
            );

            // د PN/LID دواړه پېژندپاڼې ورکوو؛ ثابت کلید د شمېر، اخطار او موقتي محدودیت لپاره هم کارېږي.
            const senderIdentifiers = [
              participantJid,
              msg.key?.participant,
              msg.key?.participantAlt,
              msg.key?.participantPn,
              msg.key?.remoteJidAlt,
            ].filter(Boolean);
            const senderResolution = await resolveGroupSender(
              socket,
              groupJid,
              senderIdentifiers
            );
            const isSenderGroupAdmin = senderResolution.isAdmin;

            // د پخواني وتلي غړي د بېرته راتګ اجازه یوازې له ټاکلې محرمې مدیر شمېرې اخیستل کېږي.
            const rejoinApprovalMatch = String(text || '').trim().match(
              /^(?:بېرته اجازه|د بېرته ننوتلو اجازه|approve rejoin)\\s*[:：]?\\s*([+0-9۰-۹٠-٩][0-9۰-۹٠-٩\\s().-]{5,24})$/iu
            );
            if (rejoinApprovalMatch) {
              const approverIdentifiers = [...senderIdentifiers, senderResolution.phoneNumber].filter(Boolean);
              const isDesignatedApprover = Boolean(
                GROUP_REJOIN_APPROVER_PHONE &&
                typeof hasMatchingPhoneNumber === 'function' &&
                hasMatchingPhoneNumber(approverIdentifiers, GROUP_REJOIN_APPROVER_PHONE)
              );
              if (!isDesignatedApprover) {
                await safeSend(socket, groupJid, {
                  text: '⛔ دا اجازه یوازې ټاکل شوی مدیر ورکولای شي.',
                });
                continue;
              }

              const targetPhone = normalizeExemptPhone(rejoinApprovalMatch[1]);
              if (!targetPhone || !groupRejoinControl ||
                  typeof groupRejoinControl.authorizeReturn !== 'function') {
                await safeSend(socket, groupJid, {
                  text: '⚠️ د شمېرې بڼه ناسمه ده یا د بېرته ننوتلو د ثبت سیستم فعال نه دی.',
                });
                continue;
              }

              let approved = false;
              try {
                approved = groupRejoinControl.authorizeReturn(
                  groupJid,
                  targetPhone,
                  GROUP_REJOIN_APPROVER_PHONE
                );
              } catch (approvalError) {
                console.error('❌ د بېرته ننوتلو اجازه ثبت نه شوه:', approvalError?.message || approvalError);
              }

              await safeSend(socket, groupJid, {
                text: approved
                  ? '✅ د ' + targetPhone + ' شمېرې لپاره یو ځل د بېرته ننوتلو اجازه ثبت شوه. اوس یې په خپله د WhatsApp له لارې ګروپ ته ورزیات کړئ؛ اجازه یوازې د یوه بریالي بېرته شاملېدو لپاره ده.'
                  : 'ℹ️ دا شمېره د دې ګروپ د پخوانیو پخپله وتلو غړو په ثبت کې نشته؛ اجازه ثبت نه شوه.',
              });
              continue;
            }

            // یوازې تایید شوی WhatsApp ګروپ اډمین خپله شمېره د اتومات نظم له استثناوو سره ثبتولای شي.
            if (/^(?:استثنا ثبت کړه|زما شمېره مستثنا کړه|register admin exemption)$/iu.test(cleanText)) {
              if (!isSenderGroupAdmin) {
                await safeSend(socket, groupJid, {
                  text: '⛔ دا امر یوازې د ګروپ مدیر کارولای شي.',
                });
                continue;
              }

              const adminPhone = normalizeExemptPhone(
                senderResolution.phoneNumber ||
                senderIdentifiers.find(identifier => /@(?:s\.whatsapp\.net|c\.us)$/iu.test(String(identifier)))
              );
              if (!adminPhone) {
                await safeSend(socket, groupJid, {
                  text: '⚠️ ستا د مدیر شمېرې پېژندنه بشپړه نه شوه؛ د ګروپ مدیرتوب او د WhatsApp شمېره دې وڅېړه.',
                });
                continue;
              }

              // د بوټ خپله شمېره له socket.user.id څخه اخیستل کېږي؛ که موجوده وي، یو ځای ثبتېږي.
              const botPhone = normalizeExemptPhone(socket.user?.id) || normalizeExemptPhone(BOT_PHONE_NUMBER);
              const phonesToRegister = [...new Set([adminPhone, botPhone].filter(Boolean))];
              try {
                await persistModerationExemptPhones(phonesToRegister);
                if (FULL_MODERATION_EXEMPT_PHONE_NUMBERS instanceof Set) {
                  for (const phone of phonesToRegister) FULL_MODERATION_EXEMPT_PHONE_NUMBERS.add(phone);
                }
                console.log('🔐 د تایید شوي ګروپ اډمین د نظم استثنا په محرم محلي فایل کې ثبت شوه.');
                await safeSend(socket, groupJid, {
                  text: '✅ ستا د مدیر شمېره د بوټ له اتومات حذف، اخطار او موقتي محدودیت څخه مستثنا شوه. د بوټ خپله شمېره هم، که د اتصال له پېژند څخه موجوده وه، ثبت شوه.',
                });
              } catch (err) {
                console.error('❌ د مدیر د استثنا محرم ثبت ناکام شو:', err?.message || err);
                await safeSend(socket, groupJid, {
                  text: '⚠️ د مدیر شمېره په دې سرور کې خوندي نه شوه. د محلي فایل د لیکلو اجازه یا د Environment متغیرونو ټکر وڅېړه.',
                });
              }
              continue;
            }

            const configuredFullModerationExempt = isFullModerationExemptSender([
              ...senderIdentifiers,
              senderResolution.phoneNumber,
            ]);
            const botPhone = normalizeExemptPhone(socket.user?.id) || normalizeExemptPhone(BOT_PHONE_NUMBER);
            const isBotSender = Boolean(
              botPhone &&
              [...senderIdentifiers, senderResolution.phoneNumber]
                .some((identifier) => normalizeExemptPhone(identifier) === botPhone)
            );
            // تایید شوی ګروپ اډمین، د مالک استثنا او خپله د بوټ شمېره د اتومات نظم له حذف/اخطار څخه معاف دي.
            const isFullModerationExempt = configuredFullModerationExempt || isBotSender;
            if (isFullModerationExempt) {
              console.log('🔐 د مالک/بوټ باوري شمېره د ګروپ له اتومات نظم/اخطارونو معاف وپېژندل شوه.');
            }
            const stableParticipantJid = senderResolution.participantKey || participantJid;

            // اډمین کولای شي د اتومات خپرولو لپاره د همدې ګروپ JID په خصوصي پیغام کې ترلاسه کړي.
            // دا د ډلې نوم یا د بل ګروپ ID نه اټکلوي؛ یوازې د پیغام حقیقي remoteJid کاروي.
            if (
              isSenderGroupAdmin &&
              /^(?:groupid|group id|group jid|د ګروپ id|د ګروپ jid|ګروپ id|ګروپ jid|ګروپ ایدی|ګروپ آیډي|ګروپ آی ډي)$/iu.test(cleanText)
            ) {
              console.log('🔐 د اډمین له خوا د ګروپ پېژندونکي غوښتنه وشوه.');
              const privateReply = await safeSend(socket, participantJid, {
                text:
                  '📌 د دې WhatsApp ګروپ JID:\n' + groupJid + '\n\n' +
                  'په SillyDev کې د AUTO_POST_GROUP_JID د ارزښت په توګه همدا دقیق ID وکاروه.\n' +
                  'یادونه: اتومات خپرول تر AUTO_POST_ENABLED=true پورې بند پاتې کېږي.',
              });
              await safeSend(socket, groupJid, {
                text: privateReply
                  ? '✅ د ګروپ پېژندونکی مې ستا خصوصي WhatsApp چټ ته ولېږه.'
                  : 'ℹ️ د ګروپ پېژندونکی د SillyDev Console په لاګ کې ثبت شو؛ مهرباني وکړئ Console وګوره.',
              });
              continue;
            }

            const activeMute = WARNING_MUTE_ENABLED && !isFullModerationExempt
              ? getTemporaryMuteStatus(groupJid, stableParticipantJid)
              : null;
            if (activeMute) {
              const minutesLeft = Math.max(1, Math.ceil(activeMute.remainingMs / 60000));
              await deleteGroupMessage(
                socket,
                groupJid,
                msg.key,
                name,
                '⛔ د درېیم اخطار له امله لنډمهاله محدودیت فعال دی. د بندیز د ختمېدو لپاره نږدې ' +
                  minutesLeft + ' دقیقې پاتې دي؛ د دې مودې پیغامونه به حذف شي.',
                false,
                stableParticipantJid
              );
              continue;
            }

            // ==========================================
            // د WhatsApp چینلونو فارورډ شوي پوسټونه
            // ==========================================
            if (statusShare && !isFullModerationExempt) {
              await deleteGroupMessage(
                socket,
                groupJid,
                msg.key,
                name,
                '🚫 د WhatsApp Status شریک شوي پوسټونه په ګروپ کې منع دي؛ مهرباني وکړئ معلومات په عادي لیکلي پیغام کې شریک کړئ.',
                true,
                stableParticipantJid
              );
              continue;
            }

            if (channelForward && !isFullModerationExempt) {
              await deleteGroupMessage(
                socket,
                groupJid,
                msg.key,
                name,
                '🚫 د WhatsApp چینلونو فارورډ شوي پوسټونه په ګروپ کې منع دي.',
                true,
                stableParticipantJid
              );
              continue;
            }



            // ==========================================
            // 18.1 د عادي غړو د ډېر چټک پیغامونو مخنیوی
            // ==========================================
            // اډمین د چټکو پیغامونو د شمېر له امله نه حذف کېږي او نه اخطار اخلي.
            // د اډمین لینکونه د رول له مخې اجازه لري؛ د کنځلو او منع شوي فارورډ کنټرولونه لا هم جلا فعال دي.
            if (!isSenderGroupAdmin && !isFullModerationExempt) {
              const burst = recordGroupMessage(groupJid, stableParticipantJid);
              if (burst.count > BURST_LIMIT) {
                if (burst.shouldWarn) burst.markWarned();
                await deleteGroupMessage(
                  socket,
                  groupJid,
                  msg.key,
                  name,
                  '🚫 په لږ وخت کې ډېر پیغامونه لېږل سپم ګڼل کېږي. لږ تم شه او پیغامونه سره راټول کړه.',
                  burst.shouldWarn,
                  stableParticipantJid
                );
                continue;
              }
            }

            // ==========================================
            // 19. د کنځلو او سپکاوي مخنیوی
            // ==========================================

            if (!isFullModerationExempt && containsBadWord(text)) {
              await deleteGroupMessage(
                socket,
                groupJid,
                msg.key,
                name,
                '❌ په ګروپ کې کنځل او سپکاوی منع دي.',
                true,
                stableParticipantJid
              );

              continue;
            }

            // ==========================================
            // 20. د نامجازو لینکونو مخنیوی (فعال؛ د اجازې لېست او د ګروپ اډمینان مستثنا دي)
            // ==========================================

            if (
              ENABLE_LINK_MODERATION &&
              !isFullModerationExempt &&
              LINK_PATTERN.test(text) &&
              !(await isLinkPermittedForSender(
                socket,
                groupJid,
                text,
                [participantJid, msg.key?.participantAlt]
              ))
            ) {
              await deleteGroupMessage(
                socket,
                groupJid,
                msg.key,
                name,
                '🚫 په ګروپ کې د نامجازو لینکونو خپرول منع دي.',
                true,
                stableParticipantJid
              );

              continue;
            }

            // د انګلیسي کورس ځانګړي امرونه د پوښتنې د نښې له شرطه مخکې اداره کېږي.
            // د کنځلو، لینک، سپم او نورو نظم ساتنې کتنې تر دې ځایه لا ترسره شوې دي.
            if (typeof handleEnglishCourseCommand === 'function') {
              const courseHandled = await handleEnglishCourseCommand(
                socket,
                groupJid,
                text,
                {
                  participantKey: stableParticipantJid,
                  participantJid,
                  name,
                  isAdmin: isSenderGroupAdmin,
                }
              );
              if (courseHandled) continue;
            }

            // ==========================================
            // 23. سلام ته ځواب
            // ==========================================

            const greetings = [
              'سلام',
              'السلام علیکم',
              'السلامعلیکم',
              'salam',
              'hello',
              'hi',
              'وعلیکم السلام',
            ];

            if (
              text.length <= 60 &&
              greetings.some(
                (greeting) =>
                  lower.startsWith(greeting)
              )
            ) {
              await safeSend(
                socket,
                groupJid,
                {
                  text:
                    `🌍 وعلیکم السلام، قدرمن ${name} صاحب! 🌸\n\n` +
                    '🌐 د Maloomat AI | معلومات AI ګروپ ته مو په مینه ښه راغلاست وایو. ' +
                    'هیله ده زموږ علمي او معلوماتي ملتیا درته ګټوره او په زړه پورې وي. 📚',
                }
              );

              continue;
            }

            // ==========================================
            // 24. د عادي غړو د تکراري سپم مخنیوی
            // اډمین د تکرار له شمېر څخه معاف دی؛ نور د کنځلو او لینک اصول پرې هم تطبیقېږي.
            if (!isSenderGroupAdmin && !isFullModerationExempt) {
              const repeated = recordRepeatedMessage(groupJid, stableParticipantJid, text);
              if (repeated.shouldDelete) {
                await deleteGroupMessage(
                  socket,
                  groupJid,
                  msg.key,
                  name,
                  '🚫 د یوه پیغام پرله‌پسې تکرار سپم ګڼل کېږي. مهرباني وکړئ هماغه پیغام بیا بیا مه لېږئ.',
                  repeated.shouldWarn,
                  stableParticipantJid
                );
                continue;
              }
            }

            // عادي لیکنې یوازې د ګروپ د نظم له کتنې تېرېږي؛ AI یوازې پای پوښتنیزې نښې ته ځواب ورکوي.
            if (!hasTerminalQuestionMark(text)) {
              console.log('ℹ️ د پیغام په پای کې پوښتنیزه نښه نشته؛ AI ځواب نه استوي.');
              continue;
            }

            rememberGroupMember(groupJid, participantJid, name);

            const directPhoneJid = senderIdentifiers.find(
              (jid) => typeof jid === 'string' && /@(?:s\.whatsapp\.net|c\.us)$/iu.test(jid)
            );
            const metadataPhone = String(senderResolution.phoneNumber || '').trim();
            const metadataPhoneDigits = metadataPhone.replace(/\D/g, '');
            const mentionJid = directPhoneJid ||
              (/@(?:s\.whatsapp\.net|c\.us)$/iu.test(metadataPhone)
                ? metadataPhone
                : metadataPhoneDigits.length >= 7 && metadataPhoneDigits.length <= 15
                  ? metadataPhoneDigits + '@s.whatsapp.net'
                  : '');


            const groupQuotedText = extractQuotedMessageText(msg.message, extractText);
            const handledByKnowledge = await answerWithKnowledge(
              socket,
              groupJid,
              participantJid,
              text,
              name,
              { message: msg, mentionJid, quotedText: groupQuotedText }
            );

            if (handledByKnowledge) {
              continue;
            }

            // عادي خبرې نه حذف کېږي.

          } catch (err) {
            console.error(
              '❌ د ګروپ پیغام په اداره کولو کې ستونزه:',
              err?.stack || err?.message || err
            );
          }
        }
  };
}

module.exports = { createMessageHandler, hasTerminalQuestionMark };
