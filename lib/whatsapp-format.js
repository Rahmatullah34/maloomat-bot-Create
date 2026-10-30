'use strict';

// Convert common Markdown emitted by AI models into WhatsApp's supported
// text conventions. This is applied only to answer-engine replies.
function formatWhatsAppText(value) {
  if (typeof value !== 'string') return value;

  let text = value.replace(/\r\n?/gu, '\n');

  // Undo Markdown escaping before converting the visible formatting markers.
  text = text.replace(/\\([\\`*_{}\[\]()#+\-.!>])/gu, '$1');

  // Markdown headings are plain, readable WhatsApp lines: remove the hashes.
  text = text.replace(/^ {0,3}#{1,6}[ \t]+(.*?)[ \t]*#*[ \t]*$/gmu, '$1');

  // Markdown bold (**text** / __text__) becomes WhatsApp bold (*text*).
  text = text.replace(/\*\*([^\n]+?)\*\*/gu, '*$1*');
  text = text.replace(/__([^_\n]+?)__/gu, '*$1*');

  // Markdown inline code uses single backticks; WhatsApp monospace uses triples.
  text = text.replace(/(?<!`)\`([^\n`]+)\`(?!`)/gu, '```$1```');

  // Turn Markdown list prefixes into clean WhatsApp-friendly list markers.
  text = text.replace(/^([ \t]*)[-+*][ \t]+/gmu, '$1• ');
  text = text.replace(/^([ \t]*)(\d+)[.)][ \t]+/gmu, '$1$2. ');

  // WhatsApp has no Markdown blockquote syntax; keep the quoted words.
  text = text.replace(/^([ \t]*)>[ \t]?/gmu, '$1');

  // Render Markdown links as readable text followed by the destination URL.
  text = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gu, '$1 ($2)');

  // Horizontal Markdown rules add visual noise in WhatsApp messages.
  text = text.replace(/^ {0,3}(?:[-*_][ \t]*){3,}$/gmu, '');

  // Remove trailing whitespace and excessive blank lines without changing
  // the wording, language, or order of the answer.
  return text
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

module.exports = { formatWhatsAppText };
