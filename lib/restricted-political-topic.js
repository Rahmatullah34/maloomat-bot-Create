'use strict';

// Conservative safety gate for politically sensitive Taliban / Islamic Emirate
// questions. Only topic-specific references are blocked; unrelated questions,
// including ordinary Islamic/religious questions, remain answerable.
function normalizePoliticalTopicText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ـ\u200B-\u200D\uFEFF]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RESTRICTED_POLITICAL_TERMS = [
  // Common Pashto, Dari, Arabic-script, and Latin spellings.
  'طالبان',
  'طالبانو',
  'طالباني',
  'طالب امارت',
  'امارت اسلامي',
  'اسلامي امارت',
  'امارت اسلامی',
  'اسلامی امارت',
  'حکومت طالبان',
  'حکومت اسلامي امارت',
  'د اسلامي امارت',
  'اسلامي امارت افغانستان',
  'امارت افغانستان اسلامي',
  'طالبانو حکومت',
  'د طالبانو حکومت',
  'طالبانو اداره',
  'د طالبانو اداره',
  'د طالبانو مشر',
  'د طالبانو مشران',
  'طالبان حکومت',
  'طالب امارت',
  'taliban',
  'taleban',
  'the taliban',
  'afghan taliban',
  'islamic emirate',
  'islamic emirate of afghanistan',
  'taliban government',
  'taliban administration',
  'current afghan government',
  // Names often used when asking about the current ruling leadership.
  'haybatullah',
  'haibatullah',
  'hiba tullah',
  'akhundzada',
  'hebatullah',
  'هبت الله اخندزاده',
  'هبت الله آخندزاده',
  'هیبت الله',
  'هبت الله',
  'اخندزاده',
  'آخندزاده',
  'سراج الدین حقاني',
  'سراج الدین حقانی',
  'سراج الدين حقاني',
  'سراج الدين حقانی',
  'سراج الدین',
  'سراج الدین حقانی',
  'ملا برادر',
  'ملا عبدالغني برادر',
  'ملا عبدالغنی برادر',
  'ملا یعقوب',
  'ملا یعقوب مجاهد',
];

function isRestrictedPoliticalTopic(question) {
  const normalized = normalizePoliticalTopicText(question);
  if (!normalized) return false;
  const padded = ' ' + normalized + ' ';
  return RESTRICTED_POLITICAL_TERMS.some(term => {
    const normalizedTerm = normalizePoliticalTopicText(term);
    return normalizedTerm && padded.includes(' ' + normalizedTerm + ' ');
  });
}

const RESTRICTED_POLITICAL_REPLY =
  'بښنه غواړم، د دې موضوع په اړه معلومات فعلاً زموږ په خدمت کې نشته. مهرباني وکړئ د بلې موضوع په اړه پوښتنه وکړئ.';

module.exports = {
  normalizePoliticalTopicText,
  isRestrictedPoliticalTopic,
  RESTRICTED_POLITICAL_REPLY,
};
