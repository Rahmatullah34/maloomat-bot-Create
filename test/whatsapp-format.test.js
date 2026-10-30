'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatWhatsAppText } = require('../lib/whatsapp-format');

test('removes Markdown heading markers and converts bold to WhatsApp syntax', () => {
  const input = '## لومړی درس\n\n### مهمې جملې\n**Hello!** — سلام';
  const expected = 'لومړی درس\n\nمهمې جملې\n*Hello!* — سلام';
  assert.equal(formatWhatsAppText(input), expected);
});

test('converts Markdown bullets and numbered list markers', () => {
  const input = '- لومړی ټکی\n* دویم ټکی\n1) درېیم ټکی\n2. څلورم ټکی';
  const expected = '• لومړی ټکی\n• دویم ټکی\n1. درېیم ټکی\n2. څلورم ټکی';
  assert.equal(formatWhatsAppText(input), expected);
});

test('converts inline code and renders Markdown links readably', () => {
  const input = 'کمانډ: `npm test`\n[رسمي سرچینه](https://example.com/help)';
  const expected = 'کمانډ: ```npm test```\nرسمي سرچینه (https://example.com/help)';
  assert.equal(formatWhatsAppText(input), expected);
});

test('preserves existing WhatsApp bold syntax and normalizes blank lines', () => {
  const input = '*مهم متن*\n\n\nعادي متن';
  assert.equal(formatWhatsAppText(input), '*مهم متن*\n\nعادي متن');
});

test('returns non-string values unchanged', () => {
  assert.equal(formatWhatsAppText(null), null);
  assert.equal(formatWhatsAppText(42), 42);
});
