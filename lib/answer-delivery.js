'use strict';

const DEFAULT_MAX_WHATSAPP_TEXT = 3000;

function findSafeCut(text, maxChars) {
  const sample = text.slice(0, maxChars);
  const minimumCut = Math.floor(maxChars * 0.55);
  const paragraphBreak = sample.lastIndexOf('\n\n');
  if (paragraphBreak >= minimumCut) return paragraphBreak + 2;
  const lineBreak = sample.lastIndexOf('\n');
  if (lineBreak >= minimumCut) return lineBreak + 1;

  let sentenceCut = 0;
  const sentencePattern = /[.!?؟۔。](?:["'»”’)\]]*)?(?:\s+|$)/gu;
  for (const match of sample.matchAll(sentencePattern)) {
    const cut = match.index + match[0].length;
    if (cut <= maxChars && cut >= minimumCut) sentenceCut = cut;
  }
  if (sentenceCut > 0) return sentenceCut;

  const whitespaceCut = sample.lastIndexOf(' ');
  if (whitespaceCut >= minimumCut) return whitespaceCut + 1;
  return maxChars;
}

function splitRawText(text, maxChars) {
  const parts = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    const cut = findSafeCut(remaining, maxChars);
    const safeCut = cut > 0 ? cut : maxChars;
    parts.push(remaining.slice(0, safeCut));
    remaining = remaining.slice(safeCut);
  }
  if (remaining.length) parts.push(remaining);
  return parts;
}

function splitWhatsAppText(value, maxChars = DEFAULT_MAX_WHATSAPP_TEXT) {
  const text = String(value || '');
  if (!text) return [];
  if (!Number.isInteger(maxChars) || maxChars < 100) throw new RangeError('maxChars باید لږ تر لږه 100 صحیح عدد وي.');
  if (text.length <= maxChars) return [text];
  const bodyLimit = maxChars - 32;
  const rawParts = splitRawText(text, bodyLimit);
  if (rawParts.length <= 1) return rawParts;
  return rawParts.map((part, index) => '📄 برخه ' + (index + 1) + '/' + rawParts.length + '\n\n' + part);
}

module.exports = { DEFAULT_MAX_WHATSAPP_TEXT, splitWhatsAppText };
