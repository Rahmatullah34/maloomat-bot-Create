const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const P = require('pino');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('🌍 د معلوماتو نړۍ - مصنوعي ځیرکتیا فعاله ده 24/7'));
app.listen(process.env.PORT || 5000, () => console.log('✅ Web server alive - Bot Ready'));

const PHONE = '93707285093';

// د Render له Environment Variables څخه د GEMINI_API_KEY په اتومات ډول اخیستل
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// د جیمینای AI امستنې
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// بدې خبرې - د اصولو د حفظ لپاره لست
const BAD_WORDS = ['کنځل','ښکنځل','خر','سګ','بیغیرت','لعنت','کوس','کون','مادر','fuck','shit','bitch','pussy','harami','احمق','چوتیا','کونی','بی ناموس','حرامی','fucking'];

const GROUP_RULES = `📜 *د معلوماتو نړۍ - د ګروپ قوانین* 📜

1️⃣ *ادب او احترام:* د ټولو غړو احترام وکړئ 🙏
2️⃣ *بدې خبرې منع:* ښکنځل، سپکې خبرې مطلق منع دي ❌
3️⃣ *علم شریک کړئ:* هر څوک کولی شي پوښتنه وکړي 📚
4️⃣ *سپیم منع:* بې ځایه لینک او اعلان منع 🚫

🚀 *زه د معلوماتو نړۍ مصنوعي ځیرکتیا یم!* د هرې موضوع په اړه موثق، دقیق او پوره معلومات له ما غوښتلی شئ.`;

// له AI څخه د ځواب اخیستلو پروسه
async function askGeminiAI(promptText, userName) {
  try {
    if (!GEMINI_API_KEY) {
      return `⚠️ *محترم ${userName} جانه!* د Gemini API Key په Render کې نه ده موندل شوې. مهرباني وکړئ په Render کې GEMINI_API_KEY تنظیم کړه.`;
    }

    const systemInstruction = `ستاسو نوم "د معلوماتو نړۍ مصنوعي ځیرکتیا" دی. 
تاسو د "د معلوماتو نړۍ" واټساپ ګروپ رسمي او خورا ځیرک مرستیال یاست. 
د پوښتونکي غړي نوم "${userName}" دی. 
تاسو باید تل هرې پوښتنې ته دقیق، کامل، موثق، علمي او روښانه ځوابونه په پښتو ژبه ورکړئ. 
ځوابونه د ایموجي او ښکلي لستونو په کارولو سره بډایه او منظم ترتیب کړئ.`;

    const result = await model.generateContent(`${systemInstruction}\n\nپوښتنه: ${promptText}`);
    const responseText = result.response.text();
    
    return `🤖 *محترم ${userName} جانه!* 🌟\n\n${responseText}`;
  } catch (error) {
    console.error('AI Error:', error.message);
    return `⚠️ *محترم ${userName} جانه!* بخښنه غواړم، د اطلاعاتو پروسس کې لنډمهاله ځنډ راغلو. مهرباني وکړئ لږ وروسته بیرته هڅه وکړئ.`;
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

  // نوی غړی
  sock.ev.on('group-participants.update', async a => {
    if (a.action === 'add') {
      for (let p of a.participants) {
        const num = p.split('@')[0];
        await sock.sendMessage(a.id, { 
          text: `🌍 *سلام @${num} جانه! د معلوماتو نړۍ ته ښه راغلاست!* 📚

🤖 *زه د معلوماتو نړۍ مصنوعي ځیرکتیا یم!*
مهرباني وکړئ د ګروپ قوانین مراعات کړئ:

${GROUP_RULES}`, 
          mentions: [p] 
        }).catch(() => {});
      }
    }
  });

  // پیغامونه پروسس کول
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
    if (['سلام', 'salam', 'hi', 'hello'].includes(lower)) {
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
