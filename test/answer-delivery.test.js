'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { splitWhatsAppText } = require('../lib/answer-delivery');

function removePartLabels(part) {
  return part.replace(/^📄 برخه \d+\/\d+\n\n/u, '');
}

test('returns a short message unchanged', () => {
  assert.deepEqual(splitWhatsAppText('سلام'), ['سلام']);
});

test('splits long text into labeled WhatsApp parts within the limit', () => {
  const text = Array.from({ length: 40 }, (_, index) => 'سرلیک ' + (index + 1) + '\nدا یوه بشپړه جمله ده چې معلومات تشریح کوي.').join('\n\n');
  const parts = splitWhatsAppText(text, 220);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((part) => part.length <= 220));
  assert.ok(parts.every((part, index) => part.startsWith('📄 برخه ' + (index + 1) + '/' + parts.length + '\n\n')));
});

test('keeps every character when splitting so no sentence or source link is silently lost', () => {
  const text = 'لومړۍ فقره د معلوماتو په اړه ده.\n\n' +
    'دویمه فقره د سرچینې لینک لري: https://example.org/research.\n\n' +
    'درېیمه فقره هم بشپړه ده او باید ورکه نه شي. '.repeat(12);
  const parts = splitWhatsAppText(text, 180);
  assert.equal(parts.map(removePartLabels).join(''), text);
});

test('prefers sentence and paragraph boundaries and reconstructs the original content', () => {
  const text = 'دا لومړۍ بشپړه جمله ده. دا دویمه بشپړه جمله ده. دا درېیمه جمله ده. '.repeat(5);
  const parts = splitWhatsAppText(text, 120);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((part) => part.length <= 120));
  assert.equal(parts.map(removePartLabels).join(''), text);
});

test('rejects an unsafe chunk size and returns no messages for empty text', () => {
  assert.deepEqual(splitWhatsAppText(''), []);
  assert.throws(() => splitWhatsAppText('متن', 20), RangeError);
});
