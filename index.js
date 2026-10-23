'use strict';

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const P = require('pino');
const express = require('express');

// ======================================================
// 1. Render سرور
// ======================================================

const app = express();

app.get('/', (_req, res) => {
  res.status(200).send(
    '🌍 د معلوماتو نړۍ — WhatsApp Group Moderation Bot'
  );
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'maloomat-bot',
    mode: 'group-only',
    ai: false,
  });
});

app.listen(
  Number(process.env.PORT) || 5000,
  '0.0.0.0',
  () => {
    console.log('✅ د Render سرور فعال شو.');
  }
);

// ======================================================
// 2. د WhatsApp تنظیمات
// ======================================================

// یوازې هغه وخت ورته اړتیا ده چې نوی اتصال جوړوې.
const PHONE = String(
  process.env.WHATSAPP_PHONE || ''
).replace(/\D/g, '');

// ======================================================
// 3. د منع شویو کلیمو او سپکاوي لېست
// ======================================================

// دا لېست د اړتیا له مخې وروسته هم زیاتولای شو.
// ځینې کلمې په بېلابېلو سیاقونو کې بېلابېلې ماناوې لري.

const BAD_WORDS = [
  // پښتو سپکاوی
  'احمق',
  'بې‌عقله',
  'بی‌عقله',
  'بې عقله',
  'بی عقله',
  'بې‌شعوره',
  'بی‌شعوره',
  'بې شعوره',
  'بی شعوره',
  'بې‌ادبه',
  'بی‌ادبه',
  'بې ادبه',
  'بی ادبه',
  'بې‌غیرته',
  'بی‌غیرته',
  'بې غیرته',
  'بی غیرته',
  'بی ناموس',
  'بې ناموس',
  'بی‌ناموس',
  'بې‌ناموس',
  'حرامزاده',
  'حرامي',
  'حرامی',
  'ولدالحرام',
  'پدرسوخته',
  'مادرجنده',
  'مادر جنده',
  'مادر قحبه',
  'خواهر جنده',
  'جنده',
  'کونی',
  'کوس',
  'کسکش',
  'کس کش',
  'چوتیا',
  'چوټیا',
  'سګ دې',
  'خره',
  'لعنتي',

  // دري او ورته سپکاوی کوونکي عبارتونه
  'بی‌شرف',
  'بیشرف',
  'بی شرف',
  'بی‌حیا',
  'بی حیا',
  'گم شو',
  'گمشو',
  'گاو',
  'کثافت',
  'آشغال',
  'پست فطرت',
  'پست‌فطرت',
  'مادر به خطا',
  'مادرخطا',
  'حرام خور',
  'حرام‌خور',
  'کثیف',
  'خبیث',
  'لعنت بر تو',

  // انګلیسي کنځلې او سپکاوی
  'fuck',
  'fucking',
  'motherfucker',
  'mother fucker',
  'shit',
  'bullshit',
  'bitch',
  'son of a bitch',
  'asshole',
  'dickhead',
  'dick',
  'pussy',
  'bastard',
  'slut',
  'whore',
  'damn you',
  'idiot',
  'moron',
];

// ======================================================
// 4. د ګروپ قوانین
// ======================================================

const GROUP_RULES = `📜 *د معلوماتو نړۍ — د ګروپ رسمي قوانین* 📜

1️⃣ *ګټور معلومات:* علمي پوښتنې او ګټور معلومات شریک کړئ.

2️⃣ *د غړو درناوی:* کنځل، سپکاوی او ځورول منع دي.

3️⃣ *د لینکونو خپرول:* نامجاز او تبلیغاتي لینکونه مه خپروئ.

4️⃣ *د پیغامونو نظم:* پرله‌پسې ډېر لنډ پیغامونه مه استوئ؛ خبرې په یوه پیغام کې راټولې کړئ.

5️⃣ *همکاري:* له ټولو غړو هیله کېږي چې قوانین مراعات کړي.

🤝 د همکارۍ مننه!`;

// ======================================================
// 5. د سپکاوي پېژندل
// ======================================================

function containsBadWord(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .normalize('NFKC');

  return BAD_WORDS.some((word) => {
    const escaped = word.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

    const flexible = escaped.replace(
      /\s+/g,
      '\\s+'
    );

    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${flexible}($|[^\\p{L}\\p{N}])`,
      'iu'
    );

    return pattern.test(normalized);
  });
}

// ======================================================
// 6. د لینکونو پېژندل
// ======================================================

const LINK_PATTERN =
  /(?:https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me\/|t\.me\/|facebook\.com|fb\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|snapchat\.com|x\.com|twitter\.com|(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|info|app|site|me|ly|dev|ai|xyz|online|shop|tech|af|us|uk)\b)/i;

// ======================================================
// 7. د WhatsApp پیغام متن ترلاسه کول
// ======================================================

function extractText(message) {
  let content = message;

  for (let i = 0; i < 6 && content; i += 1) {
    const wrapped =
      content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.viewOnceMessageV2Extension?.message ||
      content.documentWithCaptionMessage?.message;

    if (!wrapped) break;

    content = wrapped;
  }

  return String(
    content?.conversation ||
    content?.extendedTextMessage?.text ||
    content?.imageMessage?.caption ||
    content?.videoMessage?.caption ||
    content?.documentMessage?.caption ||
    content?.buttonsResponseMessage?.selectedDisplayText ||
    content?.listResponseMessage?.title ||
    content?.templateButtonReplyMessage?.selectedDisplayText ||
    content?.interactiveResponseMessage?.body?.text ||
    ''
  ).trim();
}

// ======================================================
// 8. د تکراري پیغامونو مخنیوی
// ======================================================

const seenMessages = new Map();

function rememberMessage(id) {
  const now = Date.now();

  for (const [key, time] of seenMessages) {
    if (now - time > 5 * 60 * 1000) {
      seenMessages.delete(key);
    }
  }

  if (seenMessages.has(id)) {
    return false;
  }

  seenMessages.set(id, now);

  if (seenMessages.size > 1000) {
    const oldestKey =
      seenMessages.keys().next().value;

    if (oldestKey) {
      seenMessages.delete(oldestKey);
    }
  }

  return true;
}

// ======================================================
// 9. د ۳۰ ثانیو په موده کې د پیغامونو شمېر
// ======================================================

const messageBursts = new Map();

const BURST_WINDOW_MS = 30 * 1000;
const BURST_LIMIT = 3;
const BURST_WARNING_COOLDOWN_MS = 30 * 1000;

function recordGroupMessage(
  groupJid,
  participantJid
) {
  const now = Date.now();

  const key = `${groupJid}:${participantJid}`;

  let entry = messageBursts.get(key);

  if (!entry) {
    entry = {
      timestamps: [],
      lastWarnAt: 0,
      lastSeenAt: now,
    };
  }

  // یوازې د تېرو ۳۰ ثانیو پیغامونه شمېرل کېږي.
  entry.timestamps = entry.timestamps.filter(
    (time) => now - time < BURST_WINDOW_MS
  );

  entry.timestamps.push(now);
  entry.lastSeenAt = now;

  // زاړه معلومات پاکول.
  for (const [oldKey, oldEntry] of messageBursts) {
    if (
      now - oldEntry.lastSeenAt >
      10 * 60 * 1000
    ) {
      messageBursts.delete(oldKey);
    }
  }

  messageBursts.set(key, entry);

  return {
    count: entry.timestamps.length,

    shouldWarn:
      entry.timestamps.length >= BURST_LIMIT &&
      now - entry.lastWarnAt >=
        BURST_WARNING_COOLDOWN_MS,

    markWarned: () => {
      entry.lastWarnAt = Date.now();
    },
  };
}

// ======================================================
// 10. د پیغام لېږلو خوندي طریقه
// ======================================================

async function safeSend(
  socket,
  jid,
  content
) {
  try {
    if (!socket || !jid || !content) {
      return null;
    }

    return await socket.sendMessage(
      jid,
      content
    );

  } catch (err) {
    console.error(
      '❌ د WhatsApp پیغام لېږلو ستونزه:',
      err?.message || err
    );

    return null;
  }
}

// ======================================================
// 11. د منع شوي پیغام د حذف هڅه
// ======================================================

async function deleteGroupMessage(
  socket,
  jid,
  messageKey,
  participantName,
  reason
) {
  try {
    await socket.sendMessage(jid, {
      delete: messageKey,
    });

    console.log(
      `🗑️ د حذف غوښتنه واستول شوه: ${reason}`
    );

  } catch (err) {
    console.error(
      '❌ د پیغام حذف ناکام شو. ' +
      'وګوره چې بوټ د ګروپ مدیر دی که نه:',
      err?.message || err
    );
  }

  await safeSend(socket, jid, {
    text:
      `⚠️ محترم ${participantName} جانه!\n\n` +
      `${reason}\n` +
      'مهرباني وکړئ د ګروپ قوانین مراعات کړئ. 🤝',
  });
}

// ======================================================
// 12. د اتصال او بیا وصل کېدو مدیریت
// ======================================================

let isStarting = false;
let reconnectTimer = null;
let currentSocket = null;
let pairingTimer = null;

function scheduleReconnect() {
  if (reconnectTimer) return;

  console.log(
    '🔄 بوټ به پنځه ثانیې وروسته بیا وصل شي.'
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;

    startBot().catch((err) => {
      console.error(
        '❌ بیا وصل کېدل ناکام شول:',
        err?.message || err
      );

      scheduleReconnect();
    });
  }, 5000);
}

// ======================================================
// 13. د WhatsApp بوټ پیل
// ======================================================

async function startBot() {
  if (isStarting) return;

  isStarting = true;

  try {
    const {
      state,
      saveCreds,
    } = await useMultiFileAuthState(
      'session_auth_1'
    );

    let version;

    try {
      const latest =
        await fetchLatestBaileysVersion();

      version = latest.version;

      console.log(
        '✅ د WhatsApp نسخه:',
        version.join('.')
      );

    } catch (err) {
      console.log(
        '⚠️ د WhatsApp نسخه نه شوه ترلاسه کېدای؛ ' +
        'اصلي تنظیمات به وکارول شي.'
      );
    }

    const socketConfig = {
      auth: state,

      logger: P({
        level: 'silent',
      }),

      browser: [
        'Ubuntu',
        'Chrome',
        '20.0.0',
      ],

      markOnlineOnConnect: true,
      printQRInTerminal: false,
    };

    if (version) {
      socketConfig.version = version;
    }

    const socket = makeWASocket(socketConfig);

    currentSocket = socket;

    socket.ev.on('creds.update', () => {
      saveCreds().catch((err) => {
        console.error(
          '❌ د ناستې د معلوماتو خوندي کولو ستونزه:',
          err?.message || err
        );
      });
    });

    // ================================================
    // 14. د لومړي ځل اتصال
    // ================================================

    if (!state.creds.registered) {
      if (pairingTimer) {
        clearTimeout(pairingTimer);
      }

      pairingTimer = setTimeout(async () => {
        pairingTimer = null;

        try {
          if (
            currentSocket !== socket ||
            state.creds.registered
          ) {
            return;
          }

          if (!PHONE) {
            console.error(
              '❌ که نوی اتصال ته اړتیا وي، ' +
              'WHATSAPP_PHONE په Render Environment کې تنظیم کړه.'
            );

            return;
          }

          const code =
            await socket.requestPairingCode(PHONE);

          console.log(
            '🔐 د WhatsApp اتصال کوډ جوړ شو. ' +
            'له چا سره یې مه شریکوه.'
          );

          console.log(`PAIRING CODE: ${code}`);

        } catch (err) {
          console.error(
            '❌ د اتصال کوډ جوړول ناکام شول:',
            err?.message || err
          );
        }
      }, 5000);
    }

    // ================================================
    // 15. د اتصال حالت
    // ================================================

    socket.ev.on(
      'connection.update',
      (update) => {
        const {
          connection,
          lastDisconnect,
        } = update;

        if (connection === 'open') {
          console.log(
            '✅ د معلوماتو نړۍ WhatsApp بوټ فعال شو!'
          );

          console.log(
            '🛡️ یوازې ګروپونه؛ AI بند دی.'
          );

          console.log(
            '⏱️ په ۳۰ ثانیو کې له ۳ پیغامونو وروسته خبرداری.'
          );
        }

        if (connection === 'close') {
          if (pairingTimer) {
            clearTimeout(pairingTimer);
            pairingTimer = null;
          }

          if (currentSocket === socket) {
            currentSocket = null;
          }

          const statusCode =
            lastDisconnect?.error?.output?.statusCode;

          console.error(
            '⚠️ د WhatsApp اتصال بند شو؛ حالت:',
            statusCode || 'نامعلوم'
          );

          if (
            statusCode === DisconnectReason.loggedOut
          ) {
            console.error(
              '❌ حساب له WhatsApp څخه وتلی؛ ' +
              'بیا اتصال ته اړتیا ده.'
            );

            return;
          }

          scheduleReconnect();
        }
      }
    );

    // ================================================
    // 16. نویو غړو ته ښه راغلاست
    // ================================================

    socket.ev.on(
      'group-participants.update',
      async (event) => {
        try {
          if (
            event.action !== 'add' ||
            !Array.isArray(event.participants)
          ) {
            return;
          }

          for (
            const participant of event.participants
          ) {
            const number =
              String(participant).split('@')[0];

            await safeSend(
              socket,
              event.id,
              {
                text:
                  `🌍 سلام @${number} جانه!\n\n` +
                  'د معلوماتو نړۍ ګروپ ته ښه راغلاست! 🌸\n\n' +
                  GROUP_RULES,

                mentions: [participant],
              }
            );
          }

        } catch (err) {
          console.error(
            '❌ د ښه راغلاست پیغام ستونزه:',
            err?.message || err
          );
        }
      }
    );

    // ================================================
    // 17. د ګروپ پیغامونه
    // ================================================

    socket.ev.on(
      'messages.upsert',
      async (event) => {
        const messages =
          Array.isArray(event?.messages)
            ? event.messages
            : [];

        // زاړه پیغامونه نه پروسس کېږي.
        if (event?.type !== 'notify') {
          return;
        }

        for (const msg of messages) {
          try {
            if (
              !msg?.message ||
              msg.key?.fromMe
            ) {
              continue;
            }

            const groupJid =
              msg.key?.remoteJid;

            if (
              !groupJid ||
              groupJid === 'status@broadcast' ||
              groupJid.endsWith('@newsletter')
            ) {
              continue;
            }

            // شخصي چټ بشپړ بند دی.
            if (!groupJid.endsWith('@g.us')) {
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

            if (!text) continue;

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

            console.log(
              `📩 ګروپي پیغام؛ غړی=${name}; ` +
              `متن=${text.slice(0, 100)}`
            );

            // د غړي پیغامونه شمېرل کېږي.
            const burst = recordGroupMessage(
              groupJid,
              participantJid
            );

            // ==========================================
            // 18. د کنځلو او سپکاوي مخنیوی
            // ==========================================

            if (containsBadWord(text)) {
              await deleteGroupMessage(
                socket,
                groupJid,
                msg.key,
                name,
                '❌ په ګروپ کې کنځل او سپکاوی منع دي.'
              );

              continue;
            }

            // ==========================================
            // 19. د لینکونو مخنیوی
            // ==========================================

            if (LINK_PATTERN.test(text)) {
              await deleteGroupMessage(
                socket,
                groupJid,
                msg.key,
                name,
                '🚫 په ګروپ کې د نامجازو لینکونو خپرول منع دي.'
              );

              continue;
            }

            // ==========================================
            // 20. درې یا ډېر پیغامونه په ۳۰ ثانیو کې
            // ==========================================

            // یوازې خبرداری ورکوي.
            // عادي پیغام نه حذف کوي.

            if (burst.shouldWarn) {
              const sent = await safeSend(
                socket,
                groupJid,
                {
                  text:
                    `⚠️ محترم ${name} جانه!\n\n` +
                    `تا په تېرو ۳۰ ثانیو کې ${burst.count} پیغامونه استولي دي.\n\n` +
                    'مهرباني وکړه پیغامونه په یوه پیغام کې راټول کړه، ' +
                    'څو د ګروپ نظم وساتل شي.\n\n' +
                    '📌 دا یوازې خبرداری دی؛ ستا عادي پیغام نه حذف کېږي.',
                }
              );

              if (sent) {
                burst.markWarned();
              }
            }

            // ==========================================
            // 21. د قوانینو غوښتنه
            // ==========================================

            const ruleCommands = [
              'قوانین',
              'قانون',
              'د ګروپ قوانین',
              'د ګروپ قانون',
              'rules',
              'group rules',
            ];

            if (ruleCommands.includes(cleanText)) {
              await safeSend(
                socket,
                groupJid,
                {
                  text:
                    `📜 محترم ${name} جانه!\n\n` +
                    GROUP_RULES,
                }
              );

              continue;
            }

            // ==========================================
            // 22. سلام ته ځواب
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
                    `🌍 وعلیکم سلام محترم ${name} جانه! 🌸\n\n` +
                    'د معلوماتو نړۍ ګروپ ته ښه راغلاست. ' +
                    'مهرباني وکړئ د ګروپ اصول مراعات کړئ.',
                }
              );

              continue;
            }

            // ==========================================
            // 23. نور عادي پیغامونه
            // ==========================================

            // عادي خبرې نه حذف کېږي.
            // علمي پوښتنې نه حذف کېږي.
            // لنډ معلومات نه حذف کېږي.
            // د بې‌ځایه خبرو د متن پر بنسټ قضاوت نه کېږي.
            // AI یا Gemini ته هېڅ غوښتنه نه لېږل کېږي.

          } catch (err) {
            console.error(
              '❌ د ګروپ پیغام په اداره کولو کې ستونزه:',
              err?.stack || err?.message || err
            );
          }
        }
      }
    );

  } catch (err) {
    console.error(
      '❌ د بوټ د پیل ستونزه:',
      err?.stack || err?.message || err
    );

    scheduleReconnect();

  } finally {
    isStarting = false;
  }
}

// ======================================================
// 24. د بوټ پیل
// ======================================================

startBot().catch((err) => {
  console.error(
    '❌ د بوټ د پیل عمومي ستونزه:',
    err?.stack || err?.message || err
  );

  scheduleReconnect();
});
