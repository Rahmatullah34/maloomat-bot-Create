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

const RESTRICTED_POLITICAL_PATTERNS = [
  // Common Pashto, Dari, Arabic-script, and Latin spellings.
  /\bطالبان\b/u,
  /\bطالباني\b/u,
  /\bطالبانو\b/u,
  /\bد طالبانو\b/u,
  /\bطالب امارت\b/u,
  /\bامارت اسلامي\b/u,
  /\bاسلامي امارت\b/u,
  /\bامارت اسلامی\b/u,
  /\bاسلامی امارت\b/u,
  /\bحکومت طالبان\b/u,
  /\bحکومت اسلامي امارت\b/u,
  /\bد اسلامي امارت\b/u,
  /\bاسلامي امارت افغانستان\b/u,
  /\bامارت افغانستان اسلامي\b/u,
  /\btaliban\b/u,
  /\btaleban\b/u,
  /\bthe taliban\b/u,
  /\bafghan taliban\b/u,
  /\bislamic emirate\b/u,
  /\bislamic emirate of afghanistan\b/u,
  /\btaliban government\b/u,
  /\btaliban administration\b/u,
  /\bcurrent afghan government\b/u,
  // Names commonly used in questions about the current ruling leadership.
  /\bhaybatullah\b/u,
  /\bhaibatullah\b/u,
  /\bakhundzada\b/u,
  /\bakhundzada\b/u,
  /\bhiba[t]?ullah\b/u,
  /\bسراج الدین حقاني\b/u,
  /\bسراج الدین حقانی\b/u,
  /\bسراج الدين حقاني\b/u,
  /\bسراج الدين حقانی\b/u,
  /\bسراج الدین\b/u,
  /\bهبت الله اخندزاده\b/u,
  /\bهبت الله آخندزاده\b/u,
  /\bهیبت الله\b/u,
  /\bاخندزاده\b/u,
  /\bآخندزاده\b/u,
  /\bملا برادر\b/u,
  /\bملا عبدالغني برادر\b/u,
  /\bملا یعقوب\b/u,
  /\bملا یعقوب مجاهد\b/u,
];

function isRestrictedPoliticalTopic(question) {
  const normalized = normalizePoliticalTopicText(question);
  if (!normalized) return false;
  return RESTRICTED_POLITICAL_PATTERNS.some(pattern => pattern.test(normalized));
}

const RESTRICTED_POLITICAL_REPLY =
  'بښنه غواړم، د دې موضوع په اړه معلومات فعلاً زموږ په خدمت کې نشته. مهرباني وکړئ د بلې موضوع په اړه پوښتنه وکړئ.';

module.exports = {
  normalizePoliticalTopicText,
  isRestrictedPoliticalTopic,
  RESTRICTED_POLITICAL_REPLY,
};
