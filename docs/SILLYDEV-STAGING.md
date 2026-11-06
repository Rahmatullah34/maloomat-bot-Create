# د SillyDev جلا ازمایښتي سرور — خوندي چک‌لېست

دا لارښود یوازې د `feature/shamela-islamic-search` د ازمایښت لپاره دی. د فعال بوټ سرور، د هغه WhatsApp ناسته، او `main` څانګه مه بدلوئ.

## ۱. د وړیا سرور ځای تایید

- د SillyDev په حساب کې تر دوو وړیا سرورونو پورې اجازه شته. که فعال بوټ یو وړیا سرور کاروي او بل وړیا ځای موجود وي، دویم سرور د ازموینې لپاره وکاروئ.
- د هر وړیا سرور منابع: ۲۵٪ CPU core، ۲۵۶ MB حافظه او ۵۱۲ MB ډیسک. د ازموینې لپاره یوازې کوچنی شخصي ګروپ وکاروئ.
- که دواړه وړیا ځایونه ډک وي، نوی وړیا سرور مه جوړوئ او هېڅ تادیه مه کوئ؛ لومړی د موجودو سرورونو حالت وڅېړئ.

## ۲. جلا سرور جوړول

په SillyDev Panel کې نوی Server جوړ کړئ او نوم یې `Maloomat AI TEST` کېږدئ. د فعال سرور Rename، Reinstall، Restart یا Edit مه کوئ.

د Startup/Software تنظیم:
- Docker image: `Nodejs 22`
- Main file: `index.js`
- د پروژې `package.json` د Node.js `>=22` شرط لري او `npm start` د `node index.js` اجرا کوي.

## ۳. د GitHub څانګه په خوندي ډول نښلول

لومړی د SillyDev په Panel کې د GitHub اتصال فعال کړئ او یوازې همدې زېرمتون ته لازم لاسرسی ورکړئ. بیا په **نوي ازمایښتي سرور** کې دا زېرمتون ونښلوئ:

- Repository: `Rahmatullah34/maloomat-bot-Create`
- Branch: `feature/shamela-islamic-search`
- Directory: `/`
- Auto deploy on push: **OFF**
- Restart on deploy: **OFF**
- Start if offline: **OFF**
- Apply repository config: **OFF**
- Sync startup back to repository: **OFF**
- Write `sillydev.conf` to GitHub: **OFF**

یادونه: د GitHub اتصال/انتخاب په براوزر کې د SillyDev Panel له لارې کېږي. د Git زېرمتون نښلول لومړنی Deploy کتار ته اچوي؛ دا باید یوازې په نوي TEST سرور کې وشي. پورته OFF انتخابونه د اتومات Deploy، Restart او د GitHub فایلونو د بدلولو مخه نیسي. د لومړني Deploy وروسته سرور تر هغې مه Start کوئ چې Startup متغیرونه مو تنظیم کړي نه وي.

## ۴. د ازمایښتي Startup متغیرونه

دا متغیرونه یوازې د TEST سرور په Startup/Environment برخه کې تنظیم کړئ. د فعال سرور ارزښتونه مه کاپي کوئ.

لومړنی خوندي پیل:
- `ENABLE_GROUP_QA=true`
- `ENABLE_PRIVATE_QA=false`
- `ENABLE_SHAMELA_SEARCH=false` (د لومړي روغتیايي پیل لپاره)
- `ENABLE_INTERNET_SEARCH=false`
- `ENABLE_AI_SUMMARIZATION=false`
- `ENABLE_LINK_MODERATION=false`
- `ENABLE_HISTORY_CLEANUP=false`
- `AUTO_POST_ENABLED=false`
- `RESET_WHATSAPP_SESSION=false`
- `SHAMELA_MAX_REQUESTS_PER_MINUTE=2`
- `SHAMELA_MAX_REQUESTS_PER_DAY=20`
- `WHATSAPP_PHONE=<د ازمایښتي WhatsApp حساب شمېره د هېواد له کوډ سره>`

د Shamela د واقعي ازموینې پر مهال، یوازې په TEST سرور کې `ENABLE_SHAMELA_SEARCH=true` کړئ او سرور Restart کړئ. د AI لنډیز لپاره `OPENROUTER_API_KEY` اختیاري دی؛ لومړی یې مه ورکوئ. که وروسته اړتیا وي، جلا/محدود OpenRouter key وکاروئ، نه د فعال بوټ secret.

که د ازمایښتي WhatsApp حساب لا نه وي جوړ شوی، `WHATSAPP_PHONE` تش مه پرېږدئ کله چې Pairing ته ورسېږئ؛ د تازه Pairing لپاره نوې ازمایښتي شمېره اړینه ده.

## ۵. WhatsApp ناسته او ګروپ

- د فعال بوټ `session_auth_1/` هېڅکله کاپي یا اپلوډ نه کړئ.
- TEST سرور باید له صفره خپله `session_auth_1/` جوړه کړي او یوازې د جلا ازمایښتي WhatsApp حساب Pairing وشي.
- Pairing code محرم دی؛ په سکرین‌شاټ، پیغام یا GitHub کې یې مه شریکوئ.
- ازمایښتي حساب یوازې په یوه شخصي TEST ګروپ کې شامل کړئ. د TEST بوټ شمېره د فعال بوټ له شمېرې جلا وي.
- د TEST ګروپ JID چې معلوم شي، د Startup متغیر `ALLOWED_GROUPS` کې یوازې هماغه JID ولیکئ. د دې متغیر تش پرېښودل په کوډ کې د ټولو ګروپونو اجازه ورکوي؛ تر JID معلومېدو پورې د ازمایښتي WhatsApp حساب بل هېڅ ګروپ ته مه ورزیاتوئ.
- TEST بوټ په پیل کې عادي غړی وساتئ؛ د حذف/اخطار د ادمین واکونه مه ورکوئ.
- د ازمایښت لپاره د حقیقي کاروونکو ډلې مه کاروئ.

## ۶. د روغتیا او Rate Limit تایید

له لومړي Start وروسته:
1. په SillyDev Console کې وګورئ چې Node.js پروسه له خطا پرته روانه ده.
2. د سرور د عامه URL په پای کې `/health` خلاص کړئ؛ `whatsapp.connection` باید د Pairing وروسته `connected` شي.
3. لومړی `ENABLE_SHAMELA_SEARCH=false` وساتئ او یوازې اتصال/روغتیا تایید کړئ.
4. وروسته `ENABLE_SHAMELA_SEARCH=true` کړئ او په TEST ګروپ کې یوه واقعي پښتو دیني پوښتنه واستوئ.
5. د ځواب کتاب، لیکوال، ټوک/مخ او لینک تایید کړئ.
6. د SillyDev Files کې `data/shamela-rate-limit.json` وګورئ. دا د غوښتنو محلي شمېر دی؛ مه یې Delete کوئ او مه یې GitHub ته پورته کوئ. د سرور له Restart وروسته یې بیا وګورئ، څو د شمېر دوام تایید شي.

یادونه: محدودوونکی د یوه فعال Node.js Instance لپاره جوړ شوی. د TEST سرور یوازې یو Instance وچلوئ. د `data/` فولډر محلي فایل باید د سرور په دوامداره ذخیره کې پاتې شي؛ د هر Deploy وروسته یې موجودیت تایید کړئ.

## ۷. د ازموینې د پای شرط

TEST پړاو یوازې هغه وخت بریالی ګڼل کېږي چې:
- د جلا WhatsApp حساب اتصال ثابت وي.
- د Shamela غوښتنې د ۲/دقیقې او ۲۰/ورځ له حد څخه پورته نه ځي.
- د ورځې حد د Restart وروسته هم ساتل کېږي.
- د بوټ پخوانۍ ځانګړنې په TEST ګروپ کې وازمویل شي.
- د فعال بوټ حالت، فایلونه، ناستې او `main` هېڅ بدلون نه وي کړی.

**Merge، د فعال بوټ Deploy، یا د فعال سرور Restart د دې چک‌لېست برخه نه ده او تر جلا څرګندې اجازې پورې منع دي.**
