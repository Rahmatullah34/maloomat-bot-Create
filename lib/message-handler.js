'use strict';

const { handlePrivateCvMessage: defaultHandlePrivateCvMessage } = require('./cv-service');
const { handleGroupChallengeMessage: defaultHandleGroupChallengeMessage } = require('./group-challenge');

function createMessageHandler(dependencies) {
  const {
    socket,
    shouldHandleNotifyEvent,
    classifyRemoteJid,
    isReactionMessage,
    ENABLE_PRIVATE_QA,
    PRIVATE_QA_ALLOWED_NUMBERS,
    PRIVATE_QA_ALLOWED_LIDS,
    rememberMessage,
    extractText,
    safeSend,
    answerWithKnowledge,
    handlePrivateCvMessage = defaultHandlePrivateCvMessage,
    handleGroupChallengeMessage = defaultHandleGroupChallengeMessage,
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
  } = dependencies || {};

  if (!socket?.ev || typeof shouldHandleNotifyEvent !== 'function' ||
      typeof answerWithKnowledge !== 'function' || typeof safeSend !== 'function') {
    throw new TypeError('createMessageHandler requires a socket, router, answer engine, and safeSend');
  }

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
              if (!ENABLE_PRIVATE_QA) {
                continue;
              }

              // شخصي ځوابونه یوازې مجازې شمېرې ته؛ د LID لپاره PN بدیل باید موجود وي.
              const privateSenderJids = [
                groupJid,
                msg.key?.remoteJidAlt,
                msg.key?.participant,
                msg.key?.participantAlt,
              ];

              const isPermittedPrivatePhoneJid = (jid) => {
                if (
                  typeof jid !== 'string' ||
                  !/@(?:s\.whatsapp\.net|c\.us)$/.test(jid)
                ) {
                  return false;
                }
                const digits = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
                return PRIVATE_QA_ALLOWED_NUMBERS.has(digits);
              };

              const isPermittedPrivateLid = (jid) => {
                if (typeof jid !== 'string' || !/@lid$/iu.test(jid)) return false;
                const lidDigits = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
                return Boolean(lidDigits) && PRIVATE_QA_ALLOWED_LIDS.has(lidDigits);
              };

              let isAuthorizedPrivateSender =
                privateSenderJids.some(isPermittedPrivatePhoneJid) ||
                privateSenderJids.some(isPermittedPrivateLid);

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
                  '🔒 شخصي پیغام رد شو؛ مجاز پیژندنه ونه شوه؛ ' +
                  'د نقشې وسیله=' + (lidMappingAvailable ? 'شته' : 'نه شته') +
                  '; نقشه موندل شوې=' + (lidMappingFound ? 'هو' : 'نه') +
                  '; د مجازو شمېرو شمېر=' + PRIVATE_QA_ALLOWED_NUMBERS.size +
                  '; د مجاز LID شمېر=' + PRIVATE_QA_ALLOWED_LIDS.size +
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

              const privateText = extractText(msg.message);

              // اوس مهال په شخصي چټ کې یوازې د CV خدمت فعال دی.
              // د نورو AI خدمتونو او غږ پروسس شخصي لاره موقتي بنده ده.
              console.log(
                '📩 د مجاز شخصي چټ CV برخه پروسس کېږي؛ د متن اوږدوالی=' + privateText.length
              );

              await handlePrivateCvMessage({ socket, jid: groupJid, text: privateText, safeSend });
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

            const text =
              extractText(msg.message);
            const channelForward =
              isForwardedChannelMessage(msg);
            const statusShare =
              isWhatsAppStatusShare(msg);

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
            const isFullModerationExempt = isFullModerationExemptSender([
              ...senderIdentifiers,
              senderResolution.phoneNumber,
            ]);
            if (isFullModerationExempt) {
              console.log('🔐 د مالک باوري شمېره د ګروپ له ټولو اتومات نظم/اخطارونو معاف وپېژندل شوه.');
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

            // د واضح پوښتنو ځواب او انټرنېټي لټون فعال دی؛ عادي خبرې بې‌ځوابه پرېښودل کېږي.
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


            const handledByChallenge = await handleGroupChallengeMessage({
              socket,
              jid: groupJid,
              text,
              senderId: stableParticipantJid,
              senderName: name,
              isAdmin: isSenderGroupAdmin,
              safeSend,
            });
            if (handledByChallenge) continue;

            const handledByKnowledge = await answerWithKnowledge(
              socket,
              groupJid,
              participantJid,
              text,
              name,
              { message: msg, mentionJid }
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

module.exports = { createMessageHandler };
