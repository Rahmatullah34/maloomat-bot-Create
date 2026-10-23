const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const P = require('pino');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('🌍 د معلوماتو نړۍ - Official Google Gemini AI Active 24/7'));
app.listen(process.env.PORT || 5000, () => console.log('✅ Web server alive - Gemini Bot Ready'));

const PHONE = '93707285093';

// 🔑 د AI Studio جوړه شوې API Key دلته داخل کړئ
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY_HERE';

// د گوګل رسمي Gemini AI امستنې
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// بدې خبرې - د اخلاقو او اصولو د حفظ لپاره لست
const BAD_WORDS = ['کنځل','ښکنځل','خر','سګ','بیغیرت','لعنت','کوس','کون','مادر','fuck','shit','bitch','pussy','harami','احمق','چوتیا','کونی','بی ناموس','حرامی','fucking'];

const GROUP_RULES = `📜 *د معلوماتو نړۍ - د ګروپ قوانین* 📜

1️⃣ *ادب او احترام:* د ټولو غړو احترام وکړئ 🙏
2️⃣ *بدې خبرې منع:* ښکنځل، سپکې خبرې مطلق منع دي ❌
3️⃣ *علم شریک کړئ:* هر څوک کولی شي پوښتنه وکړي 📚
4️⃣ *سپیم منع:* بې ځایه لینک او اعلان منع 🚫

🚀 *زه ستاسو اصلي Gemini AI یم!* د هرې موضوع په اړه موثق، دقیق او پوره معلومات له ما غوښتلی شئ.`;

// له Google Gemini AI څخه د نغدو او کامل ځواب غوښتنه
async function askGeminiAI(promptText, userName) {
  try {
    const systemInstruction = `تاسو د "د معلوماتو نړۍ" ګروپ رسمي او خورا ځیرک مرستیال Google Gemini AI یاست. 
د پوښتونکي غړي نوم "${userName}" دی. 
تاسو باید هرې پوښتنې ته دقیق، کامل، موثق، علمی او روښانه ځوابونه په پښتو ژبه ورکړئ. 
ځوابونه د ایموجي او ښکلي لیستونو په کارولو سره پورته او نظم لرونکي ترتيب کړئ.`;

    const result = await model.generateContent(`${systemInstruction}\n\nپوښتنه: ${promptText}`);
    const responseText = result.response.text();
    
    return `🤖 *@${userName} جانه!* 🌟\n\n${responseText}`;
  } catch (error) {
    console.error('Gemini API Error:', error.message);
    return `⚠️ *@${userName} جانه!* بخښنه غواړم، د Gemini AI له سرور سره د پیوستون لنډ مهاله ځنډ راغلو. مهرباني وکړئ خپله پوښتنه بېرته وپوښتئ.`;
  }
}

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  
  const sock = makeWASocket({ 
    version, 
    auth: state, 
    logger: P({level:'silent'}), 
    browser: ['Ubuntu', 'Chrome', '20.0.0'], // د واټساپ د بلاک کیدو مخنیوی
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
    if (connection === 'open') console.log('✅ بوټ وصل شو - اصلي Google Gemini AI فعال شو!');
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    }
  });

  // نوی غړی - د نوم یادونه او قوانینو ښودنه
  sock.ev.on('group-participants.update', async a => {
    if (a.action === 'add') {
      for (let p of a.participants) {
        const num = p.split('@')[0];
        await sock.sendMessage(a.id, { 
          text: `🌍 *سلام @${num} جانه! د معلوماتو نړۍ ته ښه راغلاست!* 📚

🤖 *زه ستاسو Google Gemini AI یم!*
مهرباني وکړئ د ګروپ قوانین مراعات کړئ:

${GROUP_RULES}`, 
          mentions: [p] 
        }).catch(() => {});
      }
    }
  });

  // د پیغامونو ترلاسه کول او پروسس
  sock.ev.on('messages.upsert', async m => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;
    
    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';
    if (!text) return;
    
    const name = msg.pushName || msg.key.participant?.split('@')[0] || from.split('@')[0] || 'ملګری';
    const lower = text.toLowerCase().trim();
    const participant = msg.key.participant || from;

    // ۱. د بدو کلمو مخنیوی
    for (let b of BAD_WORDS) {
      if (lower.includes(b)) {
        await sock.sendMessage(from, { 
          text: `⚠️ *@${name} جانه!* مهرباني وکړئ د ګروپ قوانین او ادب مراعات کړئ! 🙏`, 
          mentions: [participant] 
        }, { quoted: msg });
        return;
      }
    }

    // ۲. د ګروپ قوانین
    if (['قوانین', 'قانون', 'rules'].includes(lower)) {
      await sock.sendMessage(from, { 
        text: `📜 *@${name} جانه، د ګروپ قوانین:*\n\n${GROUP_RULES}`, 
        mentions: [participant] 
      }, { quoted: msg });
      return;
    }

    // ۳. د سلام ځواب
    if (['سلام', 'salam', 'hi', 'hello'].includes(lower)) {
      await sock.sendMessage(from, {
        text: `🌍 *و علیکم سلام @${name} جانه!* 🙏\n\nزه د گوګل رسمي **Gemini AI** یم! 🤖\nد هرې موضوع په اړه موثق او بشپړ اطلاعات درکولای شم. خپله پوښتنه مطرح کړئ!`,
        mentions: [participant]
      }, { quoted: msg });
      return;
    }

    // ۴. د Google Gemini AI له لارې مستقیم او ژور ځواب
    if (text.length > 1) {
      await sock.sendMessage(from, { 
        text: `⏳ *@${name} جانه، Gemini AI ځواب تنظیموي...* 🧠✨` 
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
