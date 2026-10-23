const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('🌍 د معلوماتو نړۍ - AI Active (Group & Private)'));
app.listen(process.env.PORT || 5000, () => console.log('✅ Server Alive'));

const PHONE = '93707285093';

// ۱. ممنوعه او سپکې کلمې
const BAD_WORDS = [
  'کنځل','ښکنځل','خر','سګ','بیغیرت','لعنت','کوس','کون','مادر',
  'fuck','shit','bitch','pussy','harami','احمق','چوتیا','کونی',
  'بی ناموس','حرامی','fucking','بیادبه','مردار'
];

// ۲. قوانين
const GROUP_RULES = `📜 *د معلوماتو نړۍ - رسمي قوانین* 📜

1️⃣ *یوازې علمي معلومات:* دا د معلوماتو تخصصي ګروپ دی 📚
2️⃣ *عامې خبرې منع دي:* ګپ شپ سمدستي حذفیږي ❌
3️⃣ *لینکونه منع دي:* هر ډول لینکونه حذفیږي 🚫
4️⃣ *بدې خبرې منع دي:* سپکاوی مطلق منع دی 🛑`;

function isQuestionOrInfo(text) {
  const lower = text.toLowerCase().trim();
  const qWords = ['څوک', 'څه', 'ولې', 'څنګه', 'کوم', 'کله', 'چېرته', 'ایا', 'آیا', 'کولی', 'معلومات', 'پوښتنه', 'توضيح', 'تعریف', '؟', '?'];
  return qWords.some(w => lower.includes(w)) || text.length > 30;
}

// خالص او قوي ګوګل جیمینای
async function askAI(promptText, userName) {
  const rawKey = process.env.GEMINI_API_KEY;
  if (!rawKey || rawKey.trim() === '') {
    return `⚠️ *محترم ${userName} جانه!*\nستاسو د ګوګل کیلي (GEMINI_API_KEY) په Render کې نشته یا ناسمه ده.`;
  }
  const apiKey = rawKey.trim();
  const systemInstruction = `ستاسو نوم "د معلوماتو نړۍ مصنوعي ځیرکتیا" دی. د پوښتونکي نوم "${userName}" دی. یوازې همدې پوښتنې ته دقیق، موثق، او مفصل ځواب په سوچه پښتو ژبه ورکړئ.`;

  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
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
      console.log(`Gemini ${model} Error:`, e.message);
    }
  }

  return `⚠️ *محترم ${userName} جانه!*\nد معلوماتو په پروسس کې ځنډ راغی. مهرباني وکړئ لږ وروسته بیا هڅه وکړئ.`;
}

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('auth_new');
  
  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({level:'silent'}),
    browser: ['Ubuntu', 'Chrome', '20.0.0'],
    markOnlineOnConnect: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', u => {
    const { connection, lastDisconnect } = u;
    if (connection === 'open') console.log('✅ نهایي بوټ فعال شو!');
    if (connection === 'close') {
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
    }
  });

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

    if (['قوانین', 'قانون', 'rules'].includes(lower)) {
      await sock.sendMessage(from, { text: `📜 *محترم ${name} جانه:*\n\n${GROUP_RULES}`, mentions: [participant] }, { quoted: msg });
      return;
    }

    const salamList = ['سلام', 'salam', 'hi', 'hello', 'السلام', 'عليكم', 'علیکم'];
    if (salamList.some(s => lower.includes(s)) && text.length < 20) {
      await sock.sendMessage(from, { text: `🌍 *و علیکم سلام محترم ${name} جانه!* 🌸 خپله علمي پوښتنه مطرح کړئ.`, mentions: [participant] }, { quoted: msg });
      return;
    }

    // په ګروپ کې د عامو خبرو مخنیوی
    if (isGroup && !isQuestionOrInfo(text)) {
      await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
      await sock.sendMessage(from, { text: `⚠️ *محترم ${name} جانه!*\nدا د معلوماتو ګروپ دی. عامې خبرې (ګپ شپ) دلته منع دي او ستاسو پیغام حذف شو! 🚫`, mentions: [participant] });
      return;
    }

    // ۶. هم په شخصي چټ او هم په ګروپ کې پوښتنو ته د AI ځواب
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
