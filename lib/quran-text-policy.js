'use strict';

const { isQuranLongestWordQuestion } = require('./religious-source-policy');

// This answer preserves the Uthmani-script word form displayed by Quran.com.
// Do not regenerate or "normalize" this sacred-text token with an AI model.
const QURAN_LONGEST_WORD_UTHMANI = 'فَأَسۡقَيۡنَٰكُمُوهُ';

function buildVerifiedQuranLongestWordAnswer(question) {
  if (!isQuranLongestWordQuestion(question)) return null;

  return [
    '📖 *د قرآن کریم د تر ټولو اوږدې کلمې کره بڼه*',
    'په عامو مراجعو کې د قرآن کریم تر ټولو اوږده کلمه عموماً د الحجر سورت په ۲۲م آیت کې راغلې کلمه ګڼل کېږي:',
    '*' + QURAN_LONGEST_WORD_UTHMANI + '*',
    'دا د مصحف د عثماني رسم الخط بڼه ده. د عادي عربي لیکدود په متن کې د حرکاتو او د کوچني الف نښه ښايي په بله بڼه ښکاره شي. د مانا نږدې ژباړه: «نو هغه اوبه مو تاسو ته د څښلو لپاره برابرې کړې.»',
    '📖 د آیت مصحفي متن (Quran.com): https://quran.com/ar/al-hijr/22/translations/224',
    '📚 د دې کلمې په اړه ځانګړې سرچینه (IslamWeb): https://islamweb.net/en/printfatwa.php?id=81317',
  ].join('\n\n');
}

module.exports = {
  QURAN_LONGEST_WORD_UTHMANI,
  buildVerifiedQuranLongestWordAnswer,
};
