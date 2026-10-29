'use strict';

// Pure chat routing helper: it deliberately ignores broadcast/status/newsletter
// destinations before the message handler can apply group or private-chat rules.
function classifyRemoteJid(remoteJid) {
  const jid = String(remoteJid || '').trim();
  if (!jid || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return 'ignore';
  if (jid.endsWith('@g.us')) return 'group';
  if (/@(?:s\.whatsapp\.net|lid)$/iu.test(jid)) return 'private';
  return 'ignore';
}

function shouldHandleNotifyEvent(eventType, message) {
  return eventType === 'notify' &&
    Boolean(message && message.message && !message.key?.fromMe);
}

module.exports = {
  classifyRemoteJid,
  shouldHandleNotifyEvent,
};
