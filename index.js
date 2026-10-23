const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('🌍 د معلوماتو نړۍ - AI Error Debugger'));
app.listen(process.env.PORT || 5000, () => console.log('✅ Server Alive'));

const PHONE = '93707285093';

const BAD_WORDS = ['کنځل','ښکنځل','خر','سګ','بیغیرت','لعنت','کوس','کون','مادر','fuck','shit','bitch','pussy','harami','احمق','چوتیا','کونی','بی ناموس','حرامی','fucking','بیادبه','مردار'];

const GROUP_RULES = `📜 *د معلوماتو نړۍ - رسمي قوانین* 📜\n\n1️⃣ *یوازې علمي معلومات:* دا د معلوماتو تخصصي ګروپ دی 📚\n2️⃣ *عامې خبرې منع دي:* ګپ شپ سمدستي حذفیږي ❌\n3️⃣ *لینکونه منع دي:* هر ډول لینکونه حذفیږي 🚫\n4️⃣ *بدې خبرې منع دي:* سپکاوی مطلق منع دی 🛑`;

function isQuestionOrInfo(text) {
  const lower = text.toLowerCase().trim();
  const qWords = ['څوک', 'څه', 'ولې', 'څنګه', 'کوم', 'کله', 'چېرته', 'ایا', 'آیا', 'کولی', 'معلومات', 'پوښتنه', 'توضيح', 'تعریف', '؟', '?'];
  return qWords.some(w => lower.includes(w)) || text.length > 30;
}

// د ارور موندلو ځانګړی سیستم
async function askAI(promptText, userName) {
  const rawKey = process.env.GEMINI_API_KEY;
  if (!rawKey || rawKey.trim() === '') {
    return `⚠️ *محترم ${userName} جانه!*\nستاسو د ګوګل کیلي (GEMINI_API_KEY) په Render کې نشته.`;
  }
  const apiKey = rawKey.trim();
  const systemInstruction = `ستاسو نوم "د معلوماتو نړۍ مصنوعي ځیرکتیا" دی. د پوښتونکي نوم "${userName}" دی. یوازې همدې پوښتنې ته دقیق، موثق، او مفصل ځواب په سوچه پښتو ژبه ورکړئ.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: `${systemInstruction}\n\nپوښتنه: ${promptText}` }] }] })
    });
    
    // که ګوګل ارور ورکړي، بوټ به یې نیغ په نیغه واټساپ ته راولېږي
    if (!res.ok) {
       const errText = await res.text();
       return `⚠️ *تخنیکي ارور (لطفاً دا متن ما ته راکاپي کړئ):*\n\nHTTP Error: ${res.status}\n${errText.substring(0, 300)}`;
    }

    const data = await res.json();
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return `🤖 *محترم ${userName} جانه!* 🌟\n\n${data.candidates[0].content.parts[0].text}`;
    } else {
       return `⚠️ *تخنیکي ارور (دا متن ما ته راکاپي کړئ):*\n\nNo Data:\n${JSON.stringify(data).substring(0, 300)}`;
    }
  } catch (e) {
    return `⚠️ *تخنیکي ارور (دا متن ما ته راکاپي کړئ):*\n\nFetch Error:\n${e.message}`;
  }
}

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  
  // حافظه مې هماغسې پرېښوده چې بیا نوي کوډ ته اړتیا نه وي او وصل پاتې شي
  const { state, saveCreds } = await useMultiFileAuthState('session_auth_1');
  
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
        console.log(`\n✅ نوی د نښلولو کوډ: ${code}\n`);
      } catch (e) {
        console.log('Pairing error:', e.message);
      }
    }, 5000);
  }

  sock.ev.on('connection.update', u => {
    const { connection, lastDisconnect } = u;
    if (connection === 'open') console.log('✅ نهایي بوټ فعال شو!');
    if (connection === 'close') {
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
    }
  });

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

    if (BAD_WORDS.some(w => lower.includes(w)) && isGroup) {
      await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
      await sock.sendMessage(from, { text: `⚠️ *محترم ${name} جانه!* ستاسو پیغام د بدو کلمو له امله حذف شو! ❌`, mentions: [participant] });
      return;
    }

    if (/(chat\.whatsapp\.com|https?:\/\/|www\.|t\.me|facebook\.com|tiktok\.com|youtube\.com)/i.test(text) && isGroup) {
      await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
      await sock.sendMessage(from, { text: `⚠️ *محترم ${name} جانه!* په ګروپ کې د لینکونو خپرول منع دي! 🚫`, mentions: [participant] });
      return;
    }

    const salamList = ['سلام', 'salam', 'hi', 'hello', 'السلام', 'عليكم', 'علیکم'];
    if (salamList.some(s => lower.includes(s)) && text.length < 20) {
      await sock.sendMessage(from, { text: `🌍 *و علیکم سلام محترم ${name} جانه!* 🌸 خپله علمي پوښتنه مطرح کړئ.`, mentions: [participant] }, { quoted: msg });
      return;
    }

    if (isQuestionOrInfo(text)) {
      await sock.sendMessage(from, { text: `⏳ *محترم ${name} جانه، د پوښتنې علمي ځواب مو چمتو کېږي...* 🧠✨` }, { quoted: msg }).catch(() => {});
      const aiResponse = await askAI(text, name);
      if (aiResponse) {
        await sock.sendMessage(from, { text: aiResponse, mentions: [participant] }, { quoted: msg });
      }
    }
  });
}

startBot();
