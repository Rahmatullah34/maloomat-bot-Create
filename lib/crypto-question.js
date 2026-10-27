'use strict';

function normalizeQuestion(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

function isCryptoEducationQuestion(question) {
  const normalized = normalizeQuestion(question);
  if (!normalized) return false;

  const compact = normalized.replace(/[^\p{L}\p{N}]+/gu, '');
  const mentionsCrypto =
    /(?:کریپټو|کریپتو|کريپټو|کريپتو|رمزيپیسه|cryptocurrency|cryptocurrencies|crypto)/u
      .test(compact);

  if (!mentionsCrypto) return false;

  // Current-price and other time-sensitive questions need a live source, not a static entry.
  if (/(?:نن|اوس|قیمت|بیه|نرخ|today|current|latest|price|exchange rate|market cap)/iu.test(normalized)) {
    return false;
  }

  return /(?:څهده|څهشی|څهشي|تعریف|تفصیل|تفصیلي|معلومات|تشریح|ګټې|زیانونه|کارونې|څنګهکارکوي|whatis.{0,20}crypto|define|explain|meaning|description)/iu
    .test(compact);
}

module.exports = { isCryptoEducationQuestion };
