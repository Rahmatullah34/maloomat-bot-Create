'use strict';

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const P = require('pino');
const express = require('express');

// ============================================================
// 1. Render server
// ============================================================

const app = express();

app.get('/', (_req, res) => {
  res.status(200).send(
    '🌍 د معلوماتو نړۍ — WhatsApp bot is running'
  );
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'maloomat-bot'
  });
});

app.listen(Number(process.env.PORT) || 5000, '0.0.0.0', () => {
  console.log('✅ HTTP health server started');
});

// ============================================================
// 2. Settings
// ============================================================

const PHONE = String(
  process.env.WHATSAPP_PHONE || '93707285093'
).replace(/\D/g, '');

const GEMINI_MODEL = String(
  process.env.GEMINI_MODEL || 'gemini-3.8-flash'
).trim();

const GEMINI_API_KEY = String(
  process.env.GEMINI_API_KEY || ''
).trim();

const GEMINI_TIMEOUT_MS = 60000;

// ============================================================
// 3. Group moderation
// ============================================================

const BAD_WORDS = [
  'کنځل',
  'ښکنځل',
  'خر',
  'سګ',
  'بیغیرت',
  'لعنت',
  'کوس',
  'کون',
  'مادر',
  'fuck',
  'shit',
  'bitch',
  'pussy',
  'harami',
  'احمق',
  'چوتیا',
  'کونی',
  'بی ناموس',
  'حرامی',
  'fucking',
  'بیادبه',
  'مردار'
];

const GROUP_RULES = `📜 *د معلوماتو نړۍ - د ګروپ رسمي قوانین* 📜

1️⃣ *یوازې علمي او کره معلومات:* دا د معلوماتو تخصصي ګروپ دی 📚

2️⃣ *عامې خبرې او ګپ شپ منع دي:* له موضوع څخه بهر خبرې مه کوئ ❌

3️⃣ *د لینکونو خپرول منع دي:* سوداګریز او د نورو ګروپونو لینکونه مه خپروئ 🚫

4️⃣ *د سپکاوي مخنیوی:* د غړو سپکاوی منع دی 🛑`;

function isQuestionOrInfo(text) {
  const lower = String(text || '').toLowerCase().trim();

  const questionWords = [
    'څوک',
    'څه',
    'ولې',
    'څنګه',
    'کوم',
    'کله',
    'چېرته',
    'چیرته',
    'ایا',
    'آیا',
    'کولی',
    'معلومات',
    'پوښتنه',
    'توضيح',
    'تشریح',
    'تعریف',
    '؟',
    '?'
  ];

  return (
    questionWords.some((word) => lower.includes(word)) ||
    lower.length > 20
  );
}

function containsBadWord(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .normalize('NFKC');

  return BAD_WORDS.some((word) => {
    const escaped = word.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escaped.replace(
        /\s+/g,
        '\\s+'
      )}($|[^\\p{L}\\p{N}])`,
      'iu'
    );

    return pattern.test(normalized);
  });
}

const LINK_PATTERN =
  /(?:https?:\/\/|www\.|chat\.whatsapp\.com|t\.me|facebook\.com|tiktok\.com|youtube\.com|(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|info|app|site|me|ly)\b)/i;

// ============================================================
// 4. Extract WhatsApp message text
// ============================================================

function extractText(message) {
  let content = message;

  for (let i = 0; i < 6 && content; i += 1) {
    const wrapped =
      content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.viewOnceMessageV2Extension?.message ||
      content.documentWithCaptionMessage?.message;

    if (!wrapped) {
      break;
    }

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

// ============================================================
// 5. Safe WhatsApp message sending
// ============================================================

async function safeSend(
  socket,
  jid,
  content,
  options = undefined
) {
  try {
    if (!socket || !jid || !content) {
      return null;
    }

    if (options) {
      return await socket.sendMessage(
        jid,
        content,
        options
      );
    }

    return await socket.sendMessage(jid, content);

  } catch (err) {
    const code =
      err?.output?.statusCode ||
      err?.data?.statusCode ||
      'unknown';

    console.error(
      `❌ WhatsApp send failed (status ${code}):`,
      err?.message || err
    );

    return null;
  }
}

// ============================================================
// 6. Gemini AI
// ============================================================

async function askAI(promptText, userName) {
  if (!GEMINI_API_KEY) {
    console.error(
      '❌ GEMINI_API_KEY is not configured in Render.'
    );

    return (
      `⚠️ محترم ${userName} جانه، ` +
      'د AI خدمت کیلي په سرور کې تنظیم شوې نه ده.'
    );
  }

  const systemInstruction =
    `ستا نوم «د معلوماتو نړۍ مصنوعي ځیرکتیا» دی. ` +
    `د پوښتونکي نوم «${userName}» دی. ` +
    'په روانه، روښانه او درناوي ډکه پښتو ځواب ورکړه. ' +
    'د پوښتنې موضوع ته مستقیم ځواب ورکړه. ' +
    'که په کوم حقیقت ډاډه نه یې، دا خبره څرګنده کړه ' +
    'او ناسم معلومات مه جوړوه.';

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    `${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, GEMINI_TIMEOUT_MS);

  const startedAt = Date.now();

  try {
    console.log(
      `🧠 Gemini request started; model=${GEMINI_MODEL}`
    );

    const response = await fetch(url, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },

      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: systemInstruction
            }
          ]
        },

        contents: [
          {
            role: 'user',
            parts: [
              {
                text: String(promptText).slice(0, 5000)
              }
            ]
          }
        ],

        generationConfig: {
          maxOutputTokens: 1200,

          thinkingConfig: {
            thinkingLevel: 'low'
          }
        }
      }),

      signal: controller.signal
    });

    console.log(
      `📡 Gemini HTTP ${response.status}; ` +
      `elapsed=${Date.now() - startedAt}ms`
    );

    if (!response.ok) {
      const details = await response.text().catch(() => '');

      console.error(
        `❌ Gemini API returned HTTP ${response.status}:`,
        details.slice(0, 800)
      );

      if (response.status === 400) {
        return (
          `⚠️ محترم ${userName} جانه، ` +
          'د Gemini غوښتنه رد شوه (HTTP 400). ' +
          'د Render Logs وګورئ.'
        );
      }

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        return (
          `⚠️ محترم ${userName} جانه، ` +
          `د Gemini کیلي یا اجازې ستونزه ده ` +
          `(HTTP ${response.status}).`
        );
      }

      if (response.status === 404) {
        return (
          `⚠️ محترم ${userName} جانه، ` +
          'د Gemini ماډل ونه موندل شو. ' +
          'د GEMINI_MODEL تنظیم وګورئ.'
        );
      }

      if (response.status === 429) {
        return (
          `⏳ محترم ${userName} جانه، ` +
          'د Gemini د غوښتنو یا استعمال حد پوره شوی. ' +
          'لږ وروسته بیا هڅه وکړئ.'
        );
      }

      return (
        `⚠️ محترم ${userName} جانه، ` +
        `د Gemini خدمت تېروتنه ورکړه ` +
        `(HTTP ${response.status}).`
      );
    }

    const data = await response.json();

    const candidate = data?.candidates?.[0];

    const answer = candidate?.content?.parts
      ?.map((part) => part.text || '')
      .join('\n')
      .trim();

    if (answer) {
      console.log(
        `✅ Gemini answer received; ` +
        `elapsed=${Date.now() - startedAt}ms`
      );

      return (
        `🤖 *محترم ${userName} جانه!* 🌟\n\n` +
        answer
      );
    }

    console.error(
      '⚠️ Gemini response contains no text:',
      JSON.stringify(data).slice(0, 800)
    );

    if (candidate?.finishReason === 'SAFETY') {
      return (
        `⚠️ محترم ${userName} جانه، ` +
        'دا پوښتنه د AI د خوندیتوب د اصولو له امله ځواب نه شوه.'
      );
    }

    return (
      `⚠️ محترم ${userName} جانه، ` +
      'دا ځل ځواب ترلاسه نه شو. مهرباني وکړئ بیا هڅه وکړئ.'
    );

  } catch (err) {
    if (
      controller.signal.aborted ||
      err?.name === 'TimeoutError' ||
      /timed?\s*out|abort/i.test(err?.message || '')
    ) {
      console.error(
        `❌ Gemini request timed out after ` +
        `${Date.now() - startedAt}ms`
      );

      return (
        `⏳ محترم ${userName} جانه، ` +
        'د AI ځواب ځنډېدلی. لږ وروسته بیا هڅه وکړئ.'
      );
    }

    console.error(
      '❌ Gemini connection failed:',
      err?.stack || err?.message || err
    );

    return (
      `⚠️ محترم ${userName} جانه، ` +
      'د AI خدمت سره د اړیکې ستونزه ده.'
    );

  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// 7. Connection and reconnect management
// ============================================================

let isStarting = false;
let reconnectTimer = null;
let currentSocket = null;
let pairingTimer = null;

const seenMessageIds = new Map();

function rememberMessage(id) {
  const now = Date.now();

  for (const [key, timestamp] of seenMessageIds) {
    if (now - timestamp > 5 * 60 * 1000) {
      seenMessageIds.delete(key);
    }
  }

  if (seenMessageIds.has(id)) {
    return false;
  }

  seenMessageIds.set(id, now);

  if (seenMessageIds.size > 1000) {
    const oldestKey = seenMessageIds.keys().next().value;

    if (oldestKey) {
      seenMessageIds.delete(oldestKey);
    }
  }

  return true;
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  console.log(
    '🔄 WhatsApp will reconnect in 5 seconds.'
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;

    startBot().catch((err) => {
      console.error(
        '❌ Reconnect start failed:',
        err?.stack || err?.message || err
      );

      scheduleReconnect();
    });

  }, 5000);
}

// ============================================================
// 8. Start WhatsApp bot
// ============================================================

async function startBot() {
  if (isStarting) {
    return;
  }

  isStarting = true;

  try {
    const {
      state,
      saveCreds
    } = await useMultiFileAuthState('session_auth_1');

    let version;

    try {
      const latest = await fetchLatestBaileysVersion();

      version = latest.version;

      console.log(
        `✅ Baileys WhatsApp version: ${version.join('.')}`
      );

    } catch (err) {
      console.error(
        '⚠️ Could not fetch latest WhatsApp version; ' +
        'using library default:',
        err?.message || err
      );
    }

    const socketConfig = {
      auth: state,

      logger: P({
        level: 'silent'
      }),

      browser: [
        'Ubuntu',
        'Chrome',
        '20.0.0'
      ],

      markOnlineOnConnect: true,
      printQRInTerminal: false
    };

    if (version) {
      socketConfig.version = version;
    }

    const socket = makeWASocket(socketConfig);

    currentSocket = socket;

    socket.ev.on('creds.update', () => {
      saveCreds().catch((err) => {
        console.error(
          '❌ Failed to save WhatsApp credentials:',
          err?.message || err
        );
      });
    });

    // ========================================================
    // 9. Pairing code
    // ========================================================

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
              '❌ Set WHATSAPP_PHONE in Render Environment.'
            );

            return;
          }

          const code = await socket.requestPairingCode(PHONE);

          console.log(
            '✅ WhatsApp pairing code generated. ' +
            'Enter it in WhatsApp Linked Devices.'
          );

          // Pairing codes are sensitive; do not share them.
          console.log(`PAIRING CODE: ${code}`);

        } catch (err) {
          console.error(
            '❌ Pairing request failed:',
            err?.message || err
          );
        }

      }, 5000);
    }

    // ========================================================
    // 10. Connection status
    // ========================================================

    socket.ev.on('connection.update', (update) => {
      const {
        connection,
        lastDisconnect
      } = update;

      if (connection === 'open') {
        console.log(
          '✅ د معلوماتو نړۍ WhatsApp بوټ فعال شو!'
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
          '⚠️ WhatsApp connection closed; statusCode:',
          statusCode || 'unknown'
        );

        if (statusCode === DisconnectReason.loggedOut) {
          console.error(
            '❌ WhatsApp logged out. Re-pair the device ' +
            'after checking the Render session storage.'
          );

          return;
        }

        scheduleReconnect();
      }
    });

    // ========================================================
    // 11. Welcome new group members
    // ========================================================

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

          for (const participantJid of event.participants) {
            const number =
              String(participantJid).split('@')[0];

            await safeSend(socket, event.id, {
              text:
                `🌍 سلام @${number} جانه! ` +
                'د معلوماتو نړۍ ګروپ ته ښه راغلاست! 🌸\n\n' +
                GROUP_RULES,

              mentions: [
                participantJid
              ]
            });
          }

        } catch (err) {
          console.error(
            '❌ Welcome-message handler failed:',
            err?.message || err
          );
        }
      }
    );

    // ========================================================
    // 12. Incoming messages
    // ========================================================

    socket.ev.on(
      'messages.upsert',
      async (event) => {
        const messages = Array.isArray(event?.messages)
          ? event.messages
          : [];

        console.log(
          `📩 WhatsApp message event: ${event?.type}; ` +
          `count=${messages.length}`
        );

        // Process live messages, not old history synchronization.
        if (event?.type !== 'notify') {
          return;
        }

        for (const msg of messages) {
          try {
            if (!msg?.message || msg.key?.fromMe) {
              continue;
            }

            const from = msg.key?.remoteJid;

            if (
              !from ||
              from === 'status@broadcast' ||
              from.endsWith('@newsletter')
            ) {
              continue;
            }

            const messageId = msg.key?.id;

            if (
              messageId &&
              !rememberMessage(`${from}:${messageId}`)
            ) {
              console.log(
                '↩️ Duplicate message ignored.'
              );

              continue;
            }

            const isGroup = from.endsWith('@g.us');

            const text = extractText(msg.message);

            if (!text) {
              continue;
            }

            const rawName =
              msg.pushName ||
              msg.key?.participant?.split('@')[0] ||
              from.split('@')[0] ||
              'ملګری';

            const name = String(rawName)
              .replace(/[\u200B-\u200D\uFEFF]/g, '')
              .trim()
              .slice(0, 80) || 'ملګری';

            const lower = text.toLowerCase().trim();

            console.log(
              `📝 Incoming message; name=${name}; ` +
              `group=${isGroup}; text=${text.slice(0, 100)}`
            );

            // ------------------------------------------------
            // 13. Bad words in groups
            // ------------------------------------------------

            if (isGroup && containsBadWord(text)) {
              await safeSend(socket, from, {
                delete: msg.key
              });

              await safeSend(socket, from, {
                text:
                  `⚠️ محترم ${name} جانه، ` +
                  'په ګروپ کې سپکاوی منع دی. ' +
                  'د پیغام د حذف کولو هڅه وشوه. ❌'
              });

              continue;
            }

            // ------------------------------------------------
            // 14. Links in groups
            // ------------------------------------------------

            if (isGroup && LINK_PATTERN.test(text)) {
              await safeSend(socket, from, {
                delete: msg.key
              });

              await safeSend(socket, from, {
                text:
                  `⚠️ محترم ${name} جانه، ` +
                  'په ګروپ کې د لینکونو خپرول منع دي. 🚫'
              });

              continue;
            }

            // ------------------------------------------------
            // 15. Group rules
            // ------------------------------------------------

            const cleanText = lower
              .replace(/[!.؟?،,]/g, '')
              .trim();

            if (
              ['قوانین', 'قانون', 'rules'].includes(cleanText)
            ) {
              await safeSend(socket, from, {
                text:
                  `📜 محترم ${name} جانه:\n\n` +
                  GROUP_RULES
              });

              continue;
            }

            // ------------------------------------------------
            // 16. Greetings
            // ------------------------------------------------

            const greetings = [
              'سلام',
              'salam',
              'hi',
              'hello',
              'السلام',
              'عليكم',
              'علیکم'
            ];

            if (
              text.length < 25 &&
              greetings.some((greeting) =>
                lower.includes(greeting)
              )
            ) {
              await safeSend(socket, from, {
                text:
                  `🌍 وعلیکم سلام محترم ${name} جانه! 🌸 ` +
                  'خپله علمي پوښتنه مطرح کړئ.'
              });

              continue;
            }

            // ------------------------------------------------
            // 17. Group chat moderation
            // ------------------------------------------------

            if (
              isGroup &&
              !isQuestionOrInfo(text)
            ) {
              await safeSend(socket, from, {
                delete: msg.key
              });

              await safeSend(socket, from, {
                text:
                  `⚠️ محترم ${name} جانه! ` +
                  'دا د معلوماتو ګروپ دی؛ ' +
                  'مهرباني وکړئ علمي پوښتنې او ګټور معلومات ' +
                  'شریک کړئ. 🚫'
              });

              continue;
            }

            // ------------------------------------------------
            // 18. Ask Gemini
            // ------------------------------------------------

            await safeSend(socket, from, {
              text:
                `⏳ محترم ${name} جانه، ` +
                'ستاسې د پوښتنې ځواب چمتو کېږي... 🧠✨'
            });

            const aiResponse = await askAI(text, name);

            if (aiResponse) {
              await safeSend(socket, from, {
                text: aiResponse
              });
            }

          } catch (err) {
            console.error(
              '❌ Error processing one WhatsApp message:',
              err?.stack || err?.message || err
            );

            // Continue with the next message if this one fails.
          }
        }
      }
    );

  } catch (err) {
    console.error(
      '❌ Bot startup failed:',
      err?.stack || err?.message || err
    );

    scheduleReconnect();

  } finally {
    isStarting = false;
  }
}

// ============================================================
// 19. Start the bot
// ============================================================

startBot().catch((err) => {
  console.error(
    '❌ Unhandled bot startup error:',
    err?.stack || err?.message || err
  );

  scheduleReconnect();
});
