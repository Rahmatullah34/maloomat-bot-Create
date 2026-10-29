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
  'طالیبان',
  'طالبانو مشر',
  'د طالبانو مشرتابه',
  'طالبانو مشرتابه',
  'طالب امارت',
  'امارت اسلامي',
  'اسلامي امارت',
  'امارت اسلامی',
  'اسلامی امارت',
  'حکومت طالبان',
  'حکومت اسلامي امارت',
  'د اسلامي امارت',
  'د افغانستان اسلامي امارت',
  'امارت د افغانستان',
  'حکومت سرپرست',
  'سرپرست حکومت',
  'د سرپرست حکومت',
  'حکومت موقت افغانستان',
  'temporary government of afghanistan',
  'اداره سرپرست',
  'سرپرست حکومت افغانستان',
  'د امارت چارواکي',
  'امارتي چارواکي',
  'د امارت مشرتابه',
  'مقام های امارت',
  'مسئولان امارت',
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
  'talibans',
  'taliban leadership',
  'taliban leaders',
  'taliban cabinet',
  'taliban ministers',
  'taliban officials',
  'caretaker government of afghanistan',
  'afghan caretaker government',
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
  'ملا هبت الله',
  'ملا هیبت الله',
  'هبت الله آخندزاده',
  'اخند زاده',
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

const NEWS_OR_MEDIA_TERMS = [
  // Pashto and Dari terms that explicitly request news/media coverage.
  'خبر',
  'خبرونه',
  'خبرونو',
  'تازه خبر',
  'تازه خبرونه',
  'اوسني خبرونه',
  'رسنۍ',
  'رسنیو',
  'رسنیز',
  'رسنیزو',
  'راپور',
  'راپورونه',
  'راپورونو',
  'رسمي اعلامیه',
  'مطبوعات',
  'اخبار',
  'سرټکي',
  'خبرونه څه وايي',
  // English equivalents.
  'news',
  'latest news',
  'breaking news',
  'news update',
  'news updates',
  'media report',
  'media reports',
  'media coverage',
  'press report',
  'press reports',
  'headlines',
  'news article',
  'news articles',
  'reported by the media',
  'what are the media saying',
];

function includesNormalizedPhrase(normalizedText, phrase) {
  const normalizedPhrase = normalizePoliticalTopicText(phrase);
  return Boolean(normalizedPhrase) &&
    (' ' + normalizedText + ' ').includes(' ' + normalizedPhrase + ' ');
}

function isNewsOrMediaRequest(value) {
  const normalized = normalizePoliticalTopicText(value);
  if (!normalized) return false;
  return NEWS_OR_MEDIA_TERMS.some(term => includesNormalizedPhrase(normalized, term));
}

function isRestrictedPoliticalTopic(question) {
  const normalized = normalizePoliticalTopicText(question);
  if (!normalized) return false;
  const mentionsRestrictedTopic = RESTRICTED_POLITICAL_TERMS.some(
    term => includesNormalizedPhrase(normalized, term)
  );

  // News/media requests about a restricted political topic remain answerable:
  // the safety rule should not suppress a user asking what news outlets report.
  if (mentionsRestrictedTopic && isNewsOrMediaRequest(normalized)) return false;
  return mentionsRestrictedTopic;
}

const RESTRICTED_POLITICAL_REPLY =
  'بښنه غواړم، د دې موضوع په اړه معلومات فعلاً زموږ په خدمت کې نشته. مهرباني وکړئ د بلې موضوع په اړه پوښتنه وکړئ.';

module.exports = {
  normalizePoliticalTopicText,
  isRestrictedPoliticalTopic,
  isNewsOrMediaRequest,
  RESTRICTED_POLITICAL_REPLY,
};
