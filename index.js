const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const P = require('pino');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('🌍 د معلوماتو نړۍ - مصنوعي ځیرکتیا فعاله ده 24/7'));
app.listen(process.env.PORT || 5000, () => console.log('✅ Web server alive - Bot Ready'));

const PHONE = '93707285093';

// بدې خبرې
const BAD_WORDS = ['کنځل','ښکنځل','خر','سګ','بیغیرت','لعنت','کوس','کون','مادر','fuck','shit','bitch','pussy','harami','احمق','چوتیا','کونی','بی ناموس','حرامی','fucking'];

const GROUP_RULES = `📜 *د معلوماتو نړۍ - د ګروپ قوانین* 📜

1️⃣ *ادب او احترام:* د ټولو غړو احترام وکړئ 🙏
2️⃣ *بدې خبرې منع:* ښکنځل، سپکې خبرې مطلق منع دي ❌
3️⃣ *علم شریک کړئ:* هر څوک کولی شي پوښتنه وکړي 📚
4️⃣ *سپیم منع:* بې ځایه لینک او اعلان منع 🚫

🚀 *زه د معلوماتو نړۍ مصنوعي ځیرکتیا یم!* د هرې موضوع په اړه معلومات له ما غوښتلی شئ.`;

// له Google AI څخه د ځواب ترلاسه کولو فنکشن
async function askGeminiAI(promptText, userName) {
  try {
    const rawKey = process.env.GEMINI_API_KEY;
    if (!rawKey) {
      return `⚠️ *محترم ${userName} جانه!*\nپه Render کې د GEMINI_API_KEY قیمت ندی ذخیره شوی. مهرباني وکړئ په Render > Environment کې GEMINI_API_KEY واچوئ.`;
    }

    const apiKey = rawKey.trim();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const systemInstruction = `ستاسو نوم "د معلوماتو نړۍ مصنوعي ځیرکتیا" دی. 
تاسو د "د معلوماتو نړۍ" واټساپ ګروپ رسمي او ځیرک مرستیال یاست. 
د پوښتونکي غړي نوم "${userName}" دی. 
تاسو باید هرې پوښتنې ته دقیق، کامل، موثق او علمي ځوابونه په پښتو ژبه ورکړئ. 
ځوابونه د ایموجي او ښکلو لیستونو په کارولو سره تنظیم کړئ.`;

    const result = await model.generateContent(`${systemInstruction}\n\nپوښتنه: ${promptText}`);
    const responseText = result.response.text();
    
    return `🤖 *محترم ${userName} جانه!* 🌟\n\n${responseText}`;
  } catch (error) {
    console.error('Gemini API Error:', error);
    // دلته به درته د ګوګل لخوا دقیق ارور په واټساپ کې درکړل شي ترڅو په پټه ستونزه پوه شو
    return `⚠️ *محترم ${userName} جانه!*\nد ګوګل API لخوا دا ارور راغلو:\n\`${error.message || error}\``;
  }
}

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  
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
    if (connection === 'open') console.log('✅ بوټ وصل شو - د معلوماتو نړۍ مصنوعي ځیرکتیا فعاله شوه!');
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    }
  });

  // پیغامونه پروسس کول
  sock.ev.on('messages.upsert', async m => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;
    
    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';
    if (!text) return;
    
    const rawName = msg.pushName || msg.key.participant?.split('@')[0] || from.split('@')[0] || 'ملګری';
    const name = rawName.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    const lower = text.toLowerCase().trim();
    const participant = msg.key.participant || from;

    // ۱. د بدو کلمو مخنیوی
    for (let b of BAD_WORDS) {
      if (lower.includes(b)) {
        await sock.sendMessage(from, { 
          text: `⚠️ *محترم ${name} جانه!* مهرباني وکړئ د ګروپ قوانین او ادب مراعات کړئ! 🙏`, 
          mentions: [participant] 
        }, { quoted: msg });
        return;
      }
    }

    // ۲. د ګروپ قوانین
    if (['قوانین', 'قانون', 'rules'].includes(lower)) {
      await sock.sendMessage(from, { 
        text: `📜 *محترم ${name} جانه، د ګروپ قوانین:*\n\n${GROUP_RULES}`, 
        mentions: [participant] 
      }, { quoted: msg });
      return;
    }

    // ۳. د سلام ځواب
    const salamList = ['سلام', 'salam', 'hi', 'hello', 'السلام', 'عليكم', 'علیکم'];
    if (salamList.some(s => lower.includes(s))) {
      await sock.sendMessage(from, {
        text: `🌍 *و علیکم سلام محترم ${name} جانه!* 🙏\n\nزه **د معلوماتو نړۍ مصنوعي ځیرکتیا** یم! 🤖\nد هرې موضوع په اړه موثق او بشپړ اطلاعات درکولای شم. خپله پوښتنه مطرح کړئ!`,
        mentions: [participant]
      }, { quoted: msg });
      return;
    }

    // ۴. د مصنوعي ځیرکتیا له لارې ځواب
    if (text.length > 1) {
      await sock.sendMessage(from, { 
        text: `⏳ *محترم ${name} جانه، د معلوماتو نړۍ مصنوعي ځیرکتیا ځواب چمتو کوي...* 🧠✨` 
      }, { quoted: msg }).catch(() => {});
      
      const aiResponse = await askGeminiAI(text, name);
      
      await sock.sendMessage(from, { 
        text: aiResponse, 
        mentions: [participant] 
      }, { quoted: msg });
    }
  });
}

startBot();
