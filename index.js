const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('🌍 د معلوماتو نړۍ - Ultimate AI & Admin Bot Active 24/7'));
app.listen(process.env.PORT || 5000, () => console.log('✅ Server Alive'));

const PHONE = '93707285093';

// ۱. ممنوعه او سپکې کلمې
const BAD_WORDS = [
  'کنځل','ښکنځل','خر','سګ','بیغیرت','لعنت','کوس','کون','مادر',
  'fuck','shit','bitch','pussy','harami','احمق','چوتیا','کونی',
  'بی ناموس','حرامی','fucking','بیادبه','مردار'
];

// ۲. د ګروپ رسمي قوانین
const GROUP_RULES = `📜 *د معلوماتو نړۍ - د ګروپ رسمي قوانین* 📜

1️⃣ *یوازې علمي او دقیق معلومات:* دا د معلوماتو تخصصي ګروپ دی 📚
2️⃣ *عامې خبرې او ګپ شپ منع دي:* عامې خبرې سمدستي حذفیږي ❌
3️⃣ *د لینکونو خپرول منع دي:* هر ډول سوداګریز او د نورو ګروپونو لینکونه حذفیږي 🚫
4️⃣ *د بدو خبرو مخنیوی:* سپکاوی مطلق منع دی 🛑`;

// د علمي پوښتنو د پیژندلو ځیرک فلټر
function isQuestionOrInfo(text) {
  const lower = text.toLowerCase().trim();
  const qWords = ['څوک', 'څه', 'ولې', 'څنګه', 'کوم', 'کله', 'چېرته', 'ایا', 'آیا', 'کولی', 'معلومات', 'پوښتنه', 'توضيح', 'تعریف', '؟', '?'];
  
  const hasQuestionWord = qWords.some(w => lower.includes(w));
  const isLongInformative = text.length > 50; 
  
  return hasQuestionWord || isLongInformative;
}

// د مصنوعي ځیرکتیا د ځوابولو سیستم (Gemini REST API + Fallback)
async function askAI(promptText, userName) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const systemInstruction = `ستاسو نوم "د معلوماتو نړۍ مصنوعي ځیرکتیا" دی. د پوښتونکي نوم "${userName}" دی. یوازې همدې علمي پوښتنې ته پوره، موثق او منظم پښتو ځواب ورکړئ.`;

  // لومړۍ هڅه: مستقیم له Google API څخه
  if (apiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: `${systemInstruction}\n\nپوښتنه: ${promptText}` }] }] })
      });
      const data = await res.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return `🤖 *محترم ${userName} جانه!* 🌟\n\n${data.candidates[0].content.parts[0].text}`;
      }
    } catch (e) {
      console.log('Gemini API Error:', e.message);
    }
  }

  // دوهمه هڅه: که ګوګل ځواب ورنه کړ، له وړیا بیک اپ سرور څخه ځواب اخلي
  try {
    const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(systemInstruction + '\n\n' + promptText)}`);
    const textData = await res.text();
    if (textData && textData.length > 10) {
      return `🤖 *محترم ${userName} جانه!* 🌟\n\n${textData}`;
    }
  } catch (e) {
    console.log('Fallback AI Error:', e.message);
  }

  return `⚠️ *محترم ${userName} جانه!* د اطلاعاتو په پروسس کې لنډمهاله ځنډ راغلی. مهرباني وکړئ لږ وروسته بیا پوښتنه وکړئ.`;
}

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  
  // دلته مې بدلون راوست ترڅو نوی کوډ درکړي (auth_new)
  const { state, saveCreds } = await useMultiFileAuthState('auth_new');
  
  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({level:'silent'}),
    browser: ['Ubuntu', 'Chrome', '20.0.0'],
    markOnlineOnConnect: true
  });

  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(PHONE);
        console.log(`\n============================\n✅ PAIRING CODE: ${code}\n============================\n`);
      } catch (e) {
        console.log('Pairing error:', e.message);
      }
    }, 4000);
  }

  sock.ev.on('connection.update', u => {
    const { connection, lastDisconnect } = u;
    if (connection === 'open') console.log('✅ نهایي بوټ فعال شو!');
    if (connection === 'close') {
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
    }
  });

  // نوي غړي ته قوانین لېږل
  sock.ev.on('group-participants.update', async a => {
    if (a.action === 'add') {
      for (let p of a.participants) {
        const num = p.split('@')[0];
        await sock.sendMessage(a.id, { 
          text: `🌍 *سلام محترم @${num} جانه! د معلوماتو نړۍ ګروپ ته ښه راغلاست!* 🌸\n\n${GROUP_RULES}`, 
          mentions: [p] 
        }).catch(() => {});
      }
    }
  });

  // د پیغامونو پروسس
  sock.ev.on('messages.upsert', async m => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';
    if (!text) return;

    const rawName = msg.pushName || msg.key.participant?.split('@')[0] || from.split('@')[0] || 'ملګری';
    const name = rawName.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    const lower = text.toLowerCase().trim();
    const participant = msg.key.participant || from;

    // ۱. د بدو خبرو ډیلیټ کول
    if (BAD_WORDS.some(w => lower.includes(w)) && isGroup) {
      await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
      await sock.sendMessage(from, { 
        text: `⚠️ *محترم ${name} جانه!* ستاسو پیغام د بدو کلمو له امله حذف شو! ❌`, 
        mentions: [participant] 
      });
      return;
    }

    // ۲. د لینکونو ډیلیټ کول
    if (/(chat\.whatsapp\.com|https?:\/\/|www\.|t\.me|facebook\.com|tiktok\.com|youtube\.com)/i.test(text) && isGroup) {
      await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
      await sock.sendMessage(from, { 
        text: `⚠️ *محترم ${name} جانه!* په ګروپ کې د لینکونو خپرول منع دي! 🚫`, 
        mentions: [participant] 
      });
      return;
    }

    // ۳. د قوانینو پوښتنه
    if (['قوانین', 'قانون', 'rules'].includes(lower)) {
      await sock.sendMessage(from, { 
        text: `📜 *محترم ${name} جانه:*\n\n${GROUP_RULES}`, 
        mentions: [participant] 
      }, { quoted: msg });
      return;
    }

    // ۴. د سلام ځواب (لنډ)
    const salamList = ['سلام', 'salam', 'hi', 'hello', 'السلام', 'عليكم', 'علیکم'];
    if (salamList.some(s => lower.includes(s)) && text.length < 20) {
      await sock.sendMessage(from, { 
        text: `🌍 *و علیکم سلام محترم ${name} جانه!* 🌸 مهرباني وکړئ یوازې علمي پوښتنې مطرح کړئ.`, 
        mentions: [participant] 
      }, { quoted: msg });
      return;
    }

    // ۵. د عامو خبرو ډیلیټ کول (چې نه پوښتنه وي او نه معلومات)
    if (isGroup && !isQuestionOrInfo(text)) {
      await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
      await sock.sendMessage(from, { 
        text: `⚠️ *محترم ${name} جانه!*\nدا د معلوماتو ګروپ دی. عامې خبرې (ګپ شپ) دلته منع دي او ستاسو پیغام حذف شو! 🚫`, 
        mentions: [participant] 
      });
      return;
    }

    // ۶. یوازې علمي پوښتنو ته د AI ځواب
    if (isGroup && isQuestionOrInfo(text)) {
      await sock.sendMessage(from, { 
        text: `⏳ *محترم ${name} جانه، د پوښتنې علمي ځواب مو چمتو کېږي...* 🧠✨` 
      }, { quoted: msg }).catch(() => {});

      const aiResponse = await askAI(text, name);
      if (aiResponse) {
        await sock.sendMessage(from, { 
          text: aiResponse, 
          mentions: [participant] 
        }, { quoted: msg });
      }
    }
  });
}

startBot();
