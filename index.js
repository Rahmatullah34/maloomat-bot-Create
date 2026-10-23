'use strict';

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const P = require('pino');
const express = require('express');

// ==================================================
// 1. د Render سرور
// ==================================================

const app = express();

app.get('/', (_req, res) => {
  res.status(200).send(
    '🌍 د معلوماتو نړۍ - AI Active | WhatsApp bot is running'
  );
});

app.listen(process.env.PORT || 5000, '0.0.0.0', () => {
  console.log('✅ Server Alive');
});

// ==================================================
// 2. تنظیمات
// ==================================================

// د WhatsApp شمېره باید د هېواد له کوډ سره وي.
// په شمېره کې + یا تشې مه کاروئ.
const PHONE = (
  process.env.WHATSAPP_PHONE || '93707285093'
).replace(/\D/g, '');

// د Gemini AI ماډل
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || 'gemini-3.8-flash';

// API کیلي په Render کې له Environment Variables څخه اخیستل کېږي.
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || '';

// ==================================================
// 3. نامناسبې کلمې
// ==================================================

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

// ==================================================
// 4. د ګروپ قوانین
// ==================================================

const GROUP_RULES = `📜 *د معلوماتو نړۍ - د ګروپ رسمي قوانین* 📜

1️⃣ *یوازې علمي او دقیق معلومات:* دا د معلوماتو تخصصي ګروپ دی 📚

2️⃣ *عامې خبرې او ګپ شپ منع دي:* عامې خبرې حذف کېدای شي ❌

3️⃣ *د لینکونو خپرول منع دي:* سوداګریز او د نورو ګروپونو لینکونه منع دي 🚫

4️⃣ *د بدو خبرو مخنیوی:* سپکاوی منع دی 🛑`;

// ==================================================
// 5. معلومول چې پیغام پوښتنه یا معلومات دي
// ==================================================

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

// ==================================================
// 6. د WhatsApp پیغام متن راایستل
// ==================================================

function extractText(message) {
  let content = message;

  // د ځینو ځانګړو پیغامونو اصلي متن راوباسي.
  for (let i = 0; i < 5 && content; i += 1) {
    if (content.ephemeralMessage?.message) {
      content = content.ephemeralMessage.message;
      continue;
    }

    if (content.viewOnceMessage?.message) {
      content = content.viewOnceMessage.message;
      continue;
    }

    if (content.viewOnceMessageV2?.message) {
      content = content.viewOnceMessageV2.message;
      continue;
    }

    if (content.documentWithCaptionMessage?.message) {
      content = content.documentWithCaptionMessage.message;
      continue;
    }

    break;
  }

  return (
    content?.conversation ||
    content?.extendedTextMessage?.text ||
    content?.imageMessage?.caption ||
    content?.videoMessage?.caption ||
    content?.documentMessage?.caption ||
    content?.buttonsResponseMessage?.selectedDisplayText ||
    content?.listResponseMessage?.title ||
    content?.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  ).trim();
}

// ==================================================
// 7. په خوندي ډول د WhatsApp پیغام لېږل
// ==================================================

async function safeSend(sock, jid, content, options = undefined) {
  try {
    if (!jid || !content) {
      return null;
    }

    return await sock.sendMessage(jid, content, options);

  } catch (err) {
    const code =
      err?.output?.statusCode ||
      err?.data?.statusCode ||
      'نامعلوم';

    console.error(
      `❌ پیغام ونه لېږل شو (${code})، JID=${jid}:`,
      err?.message || err
    );

    // د پیغام د لېږلو یوه تېروتنه باید ټول بوټ بند نه کړي.
    return null;
  }
}

// ==================================================
// 8. د Gemini مصنوعي ځیرکتیا
// ==================================================

async function askAI(promptText, userName) {
  if (!GEMINI_API_KEY.trim()) {
    return (
      `⚠️ محترم ${userName} جانه، ` +
      'د AI خدمت کیلي په Render کې نه ده تنظیم شوې.'
    );
  }

  const systemInstruction =
    `ستا نوم «د معلوماتو نړۍ مصنوعي ځیرکتیا» دی. ` +
    `د پوښتونکي نوم «${userName}» دی. ` +
    'پوښتنې ته په روښانه، دقیق او درناوي ډک انداز، ' +
    'په پښتو ژبه ځواب ورکړه. ' +
    'که خبره یقیني نه وي، دا خبره روښانه کړه او ناسم معلومات مه جوړوه.';

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  try {
    const response = await fetch(url, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY.trim()
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
                text: promptText
              }
            ]
          }
        ],

        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1200
        }
      }),

      signal: AbortSignal.timeout(35000)
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');

      console.error(
        `❌ Gemini HTTP ${response.status}:`,
        details.slice(0, 500)
      );

      if (
        response.status === 400 ||
        response.status === 403 ||
        response.status === 404
      ) {
        return (
          `⚠️ محترم ${userName} جانه، ` +
          'د AI خدمت په تنظیماتو کې ستونزه ده. ' +
          'د Render Logs وګورئ.'
        );
      }

      if (response.status === 429) {
        return (
          `⏳ محترم ${userName} جانه، ` +
          'د AI پوښتنو حد لنډمهاله پوره شوی. ' +
          'لږ وروسته بیا هڅه وکړئ.'
        );
      }

      return (
        `⚠️ محترم ${userName} جانه، ` +
        'د AI خدمت اوس ځواب نه ورکوي. لږ وروسته بیا هڅه وکړئ.'
      );
    }

    const data = await response.json();

    const answer = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('\n')
      .trim();

    if (answer) {
      return `🤖 *محترم ${userName} جانه!* 🌟\n\n${answer}`;
    }

    console.error(
      '⚠️ Gemini ځواب کې متن نشته:',
      JSON.stringify(data).slice(0, 500)
    );

    return (
      `⚠️ محترم ${userName} جانه، ` +
      'دا ځل مناسب ځواب ترلاسه نه شو.'
    );

  } catch (err) {
    console.error(
      '❌ Gemini غوښتنه ناکامه شوه:',
      err?.message || err
    );

    return (
      `⚠️ محترم ${userName} جانه، ` +
      'د AI خدمت سره لنډمهاله اړیکه نشته. بیا هڅه وکړئ.'
    );
  }
}

// ==================================================
// 9. د بوټ د بیا نښلېدو تنظیمات
// ==================================================

let isStarting = false;
let reconnectTimer = null;
let sock = null;

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  console.log('🔄 بوټ به پنځه ثانیې وروسته بیا ونښلول شي.');

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;

    startBot().catch((err) => {
      console.error(
        '❌ د بوټ بیا پیل ناکام شو:',
        err?.message || err
      );
    });

  }, 5000);
}

// ==================================================
// 10. د WhatsApp بوټ پیل
// ==================================================

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
        '✅ د WhatsApp نسخه ترلاسه شوه:',
        version.join('.')
      );

    } catch (err) {
      console.error(
        '⚠️ د WhatsApp نسخې ترلاسه کول ناکام شول؛ ' +
        'له ډیفالټ نسخې سره هڅه کېږي:',
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

    sock = makeWASocket(socketConfig);

    // د WhatsApp د تصدیق معلومات خوندي کول
    sock.ev.on('creds.update', () => {
      saveCreds().catch((err) => {
        console.error(
          '❌ د ناستې خوندي کول ناکام شول:',
          err?.message || err
        );
      });
    });

    // ==================================================
    // 11. د WhatsApp د نښلولو کوډ
    // ==================================================

    if (!state.creds.registered) {
      setTimeout(async () => {
        try {
          if (state.creds.registered) {
            return;
          }

          if (!PHONE) {
            console.error(
              '❌ WHATSAPP_PHONE تنظیم شوی نه دی.'
            );
            return;
          }

          const code = await sock.requestPairingCode(PHONE);

          console.log(
            '\n============================\n' +
            '✅ PAIRING CODE: ' + code +
            '\n============================\n'
          );

          console.log(
            '⚠️ د نښلولو کوډ له هېچا سره مه شریکوئ.'
          );

        } catch (err) {
          console.error(
            '❌ Pairing error:',
            err?.message || err
          );
        }

      }, 5000);
    }

    // ==================================================
    // 12. د اتصال حالت څارل
    // ==================================================

    sock.ev.on('connection.update', (update) => {
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
        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        console.error(
          '⚠️ د WhatsApp اتصال وتړل شو. statusCode:',
          statusCode || 'نامعلوم'
        );

        if (statusCode === DisconnectReason.loggedOut) {
          console.error(
            '❌ WhatsApp حساب Log out شوی؛ ' +
            'بیا نښلولو ته اړتیا ده.'
          );

          return;
        }

        scheduleReconnect();
      }
    });

    // ==================================================
    // 13. نوي غړي ته ښه راغلاست
    // ==================================================

    sock.ev.on(
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

            await safeSend(sock, event.id, {
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
            '❌ د نوي غړي د ښه راغلاست پیغام ناکام شو:',
            err?.message || err
          );
        }
      }
    );

    // ==================================================
    // 14. د WhatsApp پیغامونه ترلاسه کول
    // ==================================================

    sock.ev.on('messages.upsert', async (event) => {
      console.log(
        '📩 د WhatsApp پیغام راغی:',
        event?.type,
        'شمېر:',
        event?.messages?.length || 0
      );

      try {
        const messages = Array.isArray(event?.messages)
          ? event.messages
          : [];

        for (const msg of messages) {
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
            `📝 پیغام له ${name} څخه؛ ` +
            `ګروپ=${isGroup}; متن=${text.slice(0, 100)}`
          );

          // ----------------------------------------------
          // 15. د بدو کلمو مخنیوی
          // ----------------------------------------------

          if (
            isGroup &&
            BAD_WORDS.some((word) => lower.includes(word))
          ) {
            await safeSend(sock, from, {
              delete: msg.key
            });

            await safeSend(sock, from, {
              text:
                `⚠️ محترم ${name} جانه، ` +
                'ستاسو پیغام د نامناسبو کلمو له امله ' +
                'د حذف کولو هڅه وشوه. ❌'
            });

            continue;
          }

          // ----------------------------------------------
          // 16. د لینکونو مخنیوی
          // ----------------------------------------------

          const linkPattern =
            /(chat\.whatsapp\.com|https?:\/\/|www\.|t\.me|facebook\.com|tiktok\.com|youtube\.com)/i;

          if (isGroup && linkPattern.test(text)) {
            await safeSend(sock, from, {
              delete: msg.key
            });

            await safeSend(sock, from, {
              text:
                `⚠️ محترم ${name} جانه، ` +
                'په ګروپ کې د لینکونو خپرول منع دي. 🚫'
            });

            continue;
          }

          // ----------------------------------------------
          // 17. د قوانینو غوښتنه
          // ----------------------------------------------

          const cleanText = lower
            .replace(/[!.؟?]/g, '')
            .trim();

          if (
            ['قوانین', 'قانون', 'rules'].includes(cleanText)
          ) {
            await safeSend(sock, from, {
              text:
                `📜 محترم ${name} جانه:\n\n` +
                GROUP_RULES
            });

            continue;
          }

          // ----------------------------------------------
          // 18. سلام ته ځواب
          // ----------------------------------------------

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
            greetings.some((greeting) => lower.includes(greeting))
          ) {
            await safeSend(sock, from, {
              text:
                `🌍 وعلیکم سلام محترم ${name} جانه! 🌸 ` +
                'خپله علمي پوښتنه مطرح کړئ.'
            });

            continue;
          }

          // ----------------------------------------------
          // 19. د ګروپ د عامو خبرو مخنیوی
          // ----------------------------------------------

          if (isGroup && !isQuestionOrInfo(text)) {
            await safeSend(sock, from, {
              delete: msg.key
            });

            await safeSend(sock, from, {
              text:
                `⚠️ محترم ${name} جانه! ` +
                'دا د معلوماتو ګروپ دی؛ ' +
                'عامې خبرې دلته مناسبې نه دي. 🚫'
            });

            continue;
          }

          // ----------------------------------------------
          // 20. د علمي پوښتنې AI ځواب
          // ----------------------------------------------

          if (isQuestionOrInfo(text)) {
            await safeSend(sock, from, {
              text:
                `⏳ محترم ${name} جانه، ` +
                'د پوښتنې علمي ځواب مو چمتو کېږي... 🧠✨'
            });

            const aiResponse = await askAI(text, name);

            if (aiResponse) {
              // د ځواب لېږل هم خوندي دي.
              // که WhatsApp یې رد کړي، بوټ باید بند نه شي.
              await safeSend(sock, from, {
                text: aiResponse
              });
            }
          }
        }

      } catch (err) {
        console.error(
          '❌ د messages.upsert د پروسس تېروتنه:',
          err?.stack || err?.message || err
        );
      }
    });

  } catch (err) {
    console.error(
      '❌ د بوټ د پیل تېروتنه:',
      err?.stack || err?.message || err
    );

    scheduleReconnect();

  } finally {
    isStarting = false;
  }
}

// ==================================================
// 21. بوټ پیلول
// ==================================================

startBot().catch((err) => {
  console.error(
    '❌ د بوټ د پیل نه نیول شوې تېروتنه:',
    err?.stack || err?.message || err
  );

  scheduleReconnect();
});
