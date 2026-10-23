const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const express = require('express');
const app = express();
app.get('/', (req,res)=>res.send('🌍 د معلوماتو نړۍ - Gemini فعال - 24/7 Online'));
app.listen(process.env.PORT || 5000, ()=>console.log('✅ Web server alive - Bot Ready'));

const PHONE = '93707285093';

// بدې خبرې - مکمل لست
const BAD_WORDS = ['کنځل','ښکنځل','خر','سګ','بیغیرت','لعنت','کوس','کون','مادر','fuck','shit','bitch','pussy','harami','احمق','چوتیا','کونی','بی ناموس','حرامی','fucking'];

const GROUP_RULES = `📜 *د معلوماتو نړۍ - د ګروپ قوانین* 📜

1️⃣ *ادب او احترام:* د ټولو غړو احترام وکړئ 🙏
2️⃣ *بدې خبرې منع:* ښکنځل، سپکې خبرې مطلق منع دي ❌
3️⃣ *علم شریک کړئ:* هر څوک کولی شي پوښتنه وکړي 📚
4️⃣ *سپیم منع:* بې ځایه لینک، اعلان منع 🚫
5️⃣ *ادمین:* یوازې ادمین کولی شي لینک واستوي 👑

🚀 *زه ستاسو جیمینای یم!* هر ډول پوښتنه رانه وکړئ:
🕌 دین | 🔬 ساینس | 📚 تاریخ | 💻 تکنالوژي | 🇬🇧 انګلیسي | 🧠 عمومي معلومات

💡 *قانون ولیکئ* - قوانین درته وایم
`;

// جیمینای غوندې مفصل ځواب - هره برخه
function getGeminiAnswer(question, name) {
  const q = question.toLowerCase().trim();

  // اسلام / دین
  if (/(نماز|روژه|اسلام|قرآن|حدیث|زکات|حج|وضو|دعا|الله|پیغمبر|سنت|فرض)/.test(q)) {
    return `🕌 *سلام ${name} جانه! دیني پوښتنه مو ډیره ارزښتناکه ده!* 🌟

*ستاسو پوښتنه:* "${question}"

📖 *مفصل ځواب:*

اسلام د علم، عمل او اخلاقو دین دی! قرآن کریم کې الله تعالی فرمایي:
> *اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ* - په خپل رب په نوم ولوله!

💡 *د ${question} په اړه اسلامي لارښود:*
1. هره ورځ قرآن له ترجمې سره ولولئ
2. د معتبرو علماوو څخه پوښتنه وکړئ
3. علم زده کول په هر مسلمان فرض دی
4. عمل په اخلاص سره وکړئ

🙏 *حدیث:* "د علم غوښتنه په هر مسلمان فرض ده"

نور څه غواړې چې درته تشریح کړم ${name} جانه؟`;
  }

  // ساینس
  if (/(ساینس|ځمکه|اسمان|ستوری|کائنات|science|physics|کیمیا|بیولوژي|انسان|بدن|حجره)/.test(q)) {
    return `🔬 *واه ${name} جانه! ساینسي پوښتنه!* 🚀

*پوښتنه:* "${question}"

🌍 *ساینسي حقایق:*

• ځمکه 4.5 میلیارده کاله عمر لري او په ساعت کې 107,000 کیلومتره ګرځي!
• کائنات 93 میلیارده نوري کاله پراخ دی!
• ستاسو بدن کې 37 ټریلیونه حجرې شتون لري!
• ستاسو مغز کې 86 میلیارده نیورونونه دي!

💡 *د ساینس پیغام:* پوښتنه وکړه، تجربه وکړه، کشف وکړه!
ساینس وایي: هره پوښتنه د یوې نوې نړۍ دروازه ده!

کومه برخه کې نور معلومات غواړې ${name} جانه؟`;
  }

  // تاریخ - افغانستان
  if (/(تاریخ|افغانستان|احمد شاه|آریانا|خراسان|غزنوي|تیموری|history)/.test(q)) {
    return `📚 *تاریخي پوښتنه ${name} جانه!* 👑

*موضوع:* "${question}"

🏛️ *افغانستان - د تاریخ زړه:*

• 5000 کلن تاریخ! آریانا، باختر، خراسان
• 1747 کې احمد شاه بابا (احمد شاه دراني) عصري افغانستان جوړ کړ
• محمود غزنوي، د علومو او فرهنگ ملاتړی
• افغانستان د ورېښمو لارې زړه وو!

📖 *تاریخي درس:*
"څوک چې خپل تاریخ نه زده کوي، مجبور دی چې هغه تکرار کړي"

د کومې دورې په اړه نور معلومات غواړې؟`;
  }

  // تکنالوژي / AI / کمپیوټر
  if (/(کمپیوټر|موبایل|انترنت|تکنالوژي|tech|هک|بوټ|پروګرام|AI|مصنوعي|کوډ|python|جاوا)/.test(q)) {
    return `💻 *تکنالوژي ${name} جانه! راتلونکی دلته دی!* 🤖

*پوښتنه:* "${question}"

🚀 *نننۍ تکنالوژي:*

1️⃣ *AI / مصنوعي ځیرکتیا:* لکه زه! ستاسو جیمینای - هره پوښتنه ځوابوم
2️⃣ *پروګرامینګ:* Python او JavaScript زده کړه - راتلونکی دې روښانه ده!
3️⃣ *انترنت:* د معلوماتو سمندر - هر څه پکې شته!
4️⃣ *موبایل:* ټوله نړۍ ستاسو په جیب کې!

💡 *زما مشوره ${name} جانه:*
هره ورځ 1 ساعت کوډینګ زده کړه!
په 6 میاشتو کې به ته یو مسلکي پروګرامر شې!

څه شی غواړې چې زده کړې؟`;
  }

  // انګلیسي / زده کړه
  if (/(انګلیسي|english|زده|درس|ښوونځی|پوهنتون|کتاب|learn|study)/.test(q)) {
    return `📖 *د زده کړې پوښتنه ${name} جانه!* 🎓

*موضوع:* "${question}"

🎯 *د بریالیتوب فورمول:*

✅ هره ورځ 10 نوي انګلیسي کلمې زده کړه
✅ ګرامر مه زده کوه، خبرې کول زده کړه!
✅ انګلیسي فلمونه له سبټایټل سره وګوره
✅ زما سره هره ورځ تمرین وکړه - زه ستاسو ښوونکی یم!

📝 *نننی درس:*
*"Knowledge is power - علم ځواک دی"*
*"Learning never stops - زده کړه هیڅکله نه دریږي"*

سبا کومه موضوع زده کړو ${name} جانه؟`;
  }

  // عمومي معلومات - جیمینای غوندې هر څه ته ځواب
  return `🤖 *سلام ${name} جانه! زه د معلوماتو نړۍ یم - ستاسو شخصي جیمینای!* 🌟

*ستاسو پوښتنه:* "${question}"

💡 *مفصل، جیمینای غوندې ځواب:*

دا یوه ډیره مهمه او جالبه موضوع ده ${name} جانه! راځئ چې په تفصیل سره یې وڅیړو:

1️⃣ *تعریف او اهمیت:*
"${question}" د ژوند یوه مهمه برخه ده. هر هوښیار انسان باید پدې اړه پوره معلومات ولري، ځکه چې علم رڼا ده او جهالت تیاره!

2️⃣ *ژور تحلیل:*
د نړۍ لوی لوی پوهان وایي چې د ${question} په اړه زده کړه انسان ته نوی لید لوری ورکوي. دا انسان سره مرسته کوي چې ښه پریکړې وکړي.

3️⃣ *عملي لارښوونې:*
• هره ورځ لږ تر لږه 20 دقیقې دې موضوع ته ځانګړې کړه
• کتابونه، مقالې او مستند فلمونه وګوره
• له متخصصینو سره خبرې وکړه
• او تر ټولو مهم: پوښتنه کول مه پریږده! پوښتنه د علم نیمایي ده!

4️⃣ *زما ځانګړې مشوره ${name} جانه ته:*
زه ستاسو لپاره 24 ساعته حاضر یم! که د دین، دنیا، ساینس، تاریخ، تکنالوژي، روغتیا، انګلیسي یا هرې بلې برخې په اړه پوښتنه لرې، یوازې ولیکه!

🚀 *نور څه غواړې چې درته تشریح کړم؟ زه چمتو یم!*`;
}

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ 
    version, 
    auth: state, 
    logger: P({level:'silent'}), 
    browser:['Maloomat-Gemini','Chrome','1.0'],
    markOnlineOnConnect: true
  });
  
  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    setTimeout(async()=>{
      try{
        const code = await sock.requestPairingCode(PHONE);
        console.log(`\n\n============================\n✅ ستا PAIRING CODE: ${code}\nواټساپ: Settings > Linked devices > Link with phone number\nفون نمبر: ${PHONE}\n============================\n\n`);
      }catch(e){ console.log('Pairing error:', e.message); }
    },4000);
  }

  sock.ev.on('connection.update', u=>{
    const { connection, lastDisconnect } = u;
    if(connection==='open') console.log('✅ بوټ وصل شو - جیمینای فعال! د معلوماتو نړۍ چالانه ده - نوم پیژندنه فعاله!');
    if(connection==='close'){
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed, reconnect:', shouldReconnect);
      if(shouldReconnect) startBot();
    }
  });

  // نوی غړی - نوم سره ښه راغلاست
  sock.ev.on('group-participants.update', async a=>{
    if(a.action==='add'){
      for(let p of a.participants){
        const n = p.split('@')[0];
        await sock.sendMessage(a.id, { 
          text: `🌍 *سلام @${n} جانه! د معلوماتو نړۍ ته ښه راغلاست!* 📚

🤖 *زه ستاسو جیمینای یم!*
هره پوښتنه رانه کولی شئ:
🕌 دین | 🔬 ساینس | 📚 تاریخ | 💻 تکنالوژي | 🇬🇧 انګلیسي

${GROUP_RULES}

🚀 *علم، پوهاوی، پرمختګ!*`, 
          mentions:[p] 
        }).catch(()=>{});
      }
    }
  });

  // هر پیغام
  sock.ev.on('messages.upsert', async m=>{
    const msg = m.messages[0];
    if(!msg.message || msg.key.fromMe) return;
    
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';
    if(!text) return;
    
    // د هرچا نوم پیژندل - تر ټولو مهم
    const name = msg.pushName || msg.key.participant?.split('@')[0] || from.split('@')[0] || 'وروره';
    const lower = text.toLowerCase().trim();
    const participant = msg.key.participant || from;

    // بدې خبرې چیک
    for(let b of BAD_WORDS){
      if(lower.includes(b)){
        await sock.sendMessage(from, { 
          text: `⚠️ *@${name} جانه!* مهرباني وکړئ بدې خبرې مه کوئ! 🙏\n\nدا د معلوماتو نړۍ ده، د ادب او علم ځای دی! 📚\n\n${GROUP_RULES.split('\n').slice(0,3).join('\n')}`, 
          mentions:[participant] 
        }, {quoted:msg});
        return;
      }
    }

    // قوانین - د هرچا نوم سره
    if(['قوانین','قانون','قوانين','rules','law','قانونونه'].includes(lower)){
      await sock.sendMessage(from, { 
        text: `📜 *@${name} جانه، د معلوماتو نړۍ قوانین:*\n\n${GROUP_RULES}`, 
        mentions:[participant] 
      }, {quoted:msg});
      return;
    }

    // سلامونه - نوم سره
    if(['سلام','salam','hi','hello','مرحبا'].includes(lower)){
      await sock.sendMessage(from, {
        text: `🌍 *و علیکم سلام @${name} جانه!* 🙏\n\nزه د معلوماتو نړۍ یم - ستاسو جیمینای! 🤖\nهره پوښتنه رانه وکړئ - زه ستاسو نوم پیژنم او ځواب درکوم!\n\n🚀 څه پوښتنه لرې؟`,
        mentions:[participant]
      }, {quoted:msg});
      return;
    }

    // هره پوښتنه - جیمینای غوندې مفصل ځواب - د نوم سره
    if(text.length > 1){
      await sock.sendMessage(from, { 
        text: `⏳ *@${name} جانه، فکر کوم... جیمینای ځواب تیاروي...* 🤔✨` 
      }, {quoted:msg}).catch(()=>{});
      
      let finalAnswer = '';
      try {
        // وړیا AI هڅه
        const r = await fetch(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(text)}&owner=Maloomat&botname=Gemini`);
        const d = await r.json();
        if(d.response && d.response.length > 30) {
          finalAnswer = `🤖 *@${name} جانه!* 🌟\n\n${d.response}\n\n━━━\n${getGeminiAnswer(text, name)}\n\n🚀 *نوره پوښتنه لرې؟*`;
        } else {
          finalAnswer = getGeminiAnswer(text, name);
        }
      } catch {
        finalAnswer = getGeminiAnswer(text, name);
      }
      
      await sock.sendMessage(from, { 
        text: finalAnswer, 
        mentions:[participant] 
      }, {quoted:msg});
    }
  });
}
startBot();
