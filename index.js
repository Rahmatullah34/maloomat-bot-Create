const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('🌍 د معلوماتو نړۍ - د ګروپ اډمین بوټ فعال دی 24/7'));
app.listen(process.env.PORT || 5000, () => console.log('✅ Server Alive - Admin Bot Ready'));

const PHONE = '93707285093';

// ۱. د ممنوعه بدو کلمو لیست (د حذف کولو لپاره)
const BAD_WORDS = [
  'کنځل','ښکنځل','خر','سګ','بیغیرت','لعنت','کوس','کون','مادر',
  'fuck','shit','bitch','pussy','harami','احمق','چوتیا','کونی',
  'بی ناموس','حرامی','fucking','بیادبه','مردار'
];

// ۲. د ګروپ قوانین
const GROUP_RULES = `📜 *د معلوماتو نړۍ - د ګروپ رسمي قوانین* 📜

1️⃣ *ادب او احترام:* د ټولو محترمو غړو درناوی فرض دی 🙏
2️⃣ *د لینکونو خپرول منع دي:* هر ډول سوداګریز یا د ګروپونو لینکونه سمدستي حذفیږي 🚫
3️⃣ *سپکې او بدې خبرې منع دي:* سپکاوی او بدې کلمې سمدستي حذفیږي ❌
4️⃣ *علمي او ګټور مطالب:* هیله ده یوازې ګټور او علمي معلومات شریک کړئ 📚

💡 *یادونه:* د قوانینو د نه مراعاتولو په صورت کې بوټ ستاسو پیغامونه په اتومات ډول ډیلیټ کوي.`;

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
    if (connection === 'open') console.log('✅ د معلوماتو نړۍ اډمین بوټ فعال شو!');
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    }
  });

  // نوي غړي ته بې له کښته-پورته نوم ښه راغلاست او قوانین لېږل
  sock.ev.on('group-participants.update', async a => {
    if (a.action === 'add') {
      for (let p of a.participants) {
        const num = p.split('@')[0];
        await sock.sendMessage(a.id, { 
          text: `🌍 *سلام محترم @${num} جانه! د معلوماتو نړۍ ګروپ ته ښه راغلاست!* 🌸\n\nمهرباني وکړئ د ګروپ د ښه نظم لپاره دا لاندې قوانین مراعات کړئ:\n\n${GROUP_RULES}`, 
          mentions: [p] 
        }).catch(() => {});
      }
    }
  });

  // د پیغامونو انضباطي پروسس او اتومات کنټرول
  sock.ev.on('messages.upsert', async m => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;
    
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';
    if (!text) return;
    
    // د کارونکي د پاک نوم استخراج
    const rawName = msg.pushName || msg.key.participant?.split('@')[0] || from.split('@')[0] || 'ملګری';
    const name = rawName.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    const lower = text.toLowerCase().trim();
    const participant = msg.key.participant || from;

    // A. د لینکونو کشف او اتومات ډیلیټ کول (Anti-Link)
    const hasLink = /(chat\.whatsapp\.com|https?:\/\/|www\.|t\.me|facebook\.com|tiktok\.com|youtube\.com|youtu\.be)/i.test(text);
    if (hasLink && isGroup) {
      try {
        // د ناسم پیغام ډیلیټ کول
        await sock.sendMessage(from, { delete: msg.key });
        
        // د غړي خبردارول
        await sock.sendMessage(from, { 
          text: `⚠️ *محترم ${name} جانه!*\nپه ګروپ کې د لینکونو خپرول منع دي! ستاسو پیغام د ګروپ د اصولو خلاف و او حذف شو. 🚫`, 
          mentions: [participant] 
        });
      } catch (err) {
        console.log('د پیغام حذف کولو کې ستونزه (بوټ اډمین کړئ):', err.message);
      }
      return;
    }

    // B. د بدو کلمو او سپکاوي کشف او اتومات ډیلیټ کول (Anti-Bad Words)
    const hasBadWord = BAD_WORDS.some(word => lower.includes(word));
    if (hasBadWord && isGroup) {
      try {
        // د بد پیغام حذف کول
        await sock.sendMessage(from, { delete: msg.key });
        
        // غړي ته جدي اتومات تبصره
        await sock.sendMessage(from, { 
          text: `⚠️ *محترم ${name} جانه!*\nمهرباني وکړئ د ګروپ اخلاقي او ادبي فضا وپالئ. ستاسو پیغام د بې ځایه او سپکو کلمو درلودلو له امله حذف شو! ❌`, 
          mentions: [participant] 
        });
      } catch (err) {
        console.log('د پیغام حذف کولو کې ستونزه (بوټ اډمین کړئ):', err.message);
      }
      return;
    }

    // C. د قوانینو غوښتنه
    if (['قوانین', 'قانون', 'rules', 'قوانين'].includes(lower)) {
      await sock.sendMessage(from, { 
        text: `📜 *محترم ${name} جانه، دا د ګروپ ټول قوانین دي:*\n\n${GROUP_RULES}`, 
        mentions: [participant] 
      }, { quoted: msg });
      return;
    }

    // D. د اتومات درانه سلام ځواب
    const salamList = ['سلام', 'salam', 'hi', 'hello', 'السلام', 'عليكم', 'علیکم'];
    if (salamList.some(s => lower.includes(s))) {
      await sock.sendMessage(from, {
        text: `🌍 *و علیکم سلام محترم ${name} جانه!* 🌸\n\nد **د معلوماتو نړۍ** ګروپ ته ښه راغلاست! د ګروپ د قوانینو د لیدلو لپاره *قوانین* ولیکئ.`,
        mentions: [participant]
      }, { quoted: msg });
      return;
    }
  });
}

startBot();
