'use strict';

const MAX_FIELD_LENGTH = 1800;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_ACTIVE_SESSIONS = 500;

const CV_FIELDS = [
  { key: 'fullName', required: true, prompt: '۱/۱۲ — خپل بشپړ نوم په انګلیسي ولیکه.' },
  { key: 'role', required: true, prompt: '۲/۱۲ — د کومې دندې یا مسلک لپاره CV غواړې؟ د دندې نوم په انګلیسي ولیکه.' },
  { key: 'email', required: true, prompt: '۳/۱۲ — خپل کاري Email address ولیکه.' },
  { key: 'phone', required: true, prompt: '۴/۱۲ — د اړیکې شمېره د هېواد له کوډ سره ولیکه.' },
  { key: 'location', required: true, prompt: '۵/۱۲ — ښار او هېواد ولیکه (په انګلیسي).' },
  { key: 'summary', required: true, prompt: '۶/۱۲ — د ځان، تجربې او مسلکي وړتیاوو لنډه پېژندنه په انګلیسي ولیکه (۳–۵ جملې).' },
  { key: 'skills', required: true, prompt: '۷/۱۲ — خپلې مهمې وړتیاوې په انګلیسي ولیکه؛ هره وړتیا په کامه یا نوې کرښه جلا کړه.' },
  { key: 'experience', required: true, prompt: '۸/۱۲ — کاري تجربه په انګلیسي ولیکه. د هرې دندې نوم، اداره، نېټې او مسؤلیتونه جلا کرښو کې ولیکه. که تجربه نه لرې، ولیکه: No professional experience yet.' },
  { key: 'education', required: true, prompt: '۹/۱۲ — زده‌کړې په انګلیسي ولیکه؛ د ادارې نوم، سند/درجه او د فراغت کال شامل کړه.' },
  { key: 'certifications', required: false, prompt: '۱۰/۱۲ — سندونه او روزنیز کورسونه په انګلیسي ولیکه. که نه لرې، SKIP ولیکه.' },
  { key: 'languages', required: false, prompt: '۱۱/۱۲ — ژبې او د هرې ژبې کچه ولیکه (لکه Pashto — Native). که نه غواړې، SKIP ولیکه.' },
  { key: 'linkedin', required: false, prompt: '۱۲/۱۲ — LinkedIn یا Portfolio لینک ولیکه. که نه لرې، SKIP ولیکه.' },
];

function cleanInput(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, MAX_FIELD_LENGTH);
}

function toAscii(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePdfText(value) {
  return toAscii(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(value, maxChars = 98) {
  const source = String(value || '').replace(/\r/g, '');
  const paragraphs = source.split('\n');
  const result = [];
  for (const paragraph of paragraphs) {
    const clean = toAscii(paragraph);
    if (!clean) {
      result.push('');
      continue;
    }
    let line = '';
    for (const word of clean.split(/\s+/)) {
      if (!line) {
        line = word;
      } else if ((line + ' ' + word).length <= maxChars) {
        line += ' ' + word;
      } else {
        result.push(line);
        line = word;
      }
    }
    if (line) result.push(line);
  }
  return result;
}

function textOperator(x, y, value, size = 10, font = 'F1', color = '0.16 0.19 0.24') {
  const safe = escapePdfText(value);
  if (!safe) return '';
  return color + ' rg BT /' + font + ' ' + size + ' Tf 1 0 0 1 ' + x + ' ' + y +
    ' Tm (' + safe + ') Tj ET\n';
}

function createCvPdf(data) {
  const pages = [];
  let operators = '';
  let cursorY = 0;
  let firstPage = true;

  function startPage() {
    if (operators) pages.push(operators);
    operators = '';
    if (firstPage) {
      operators += '0.07 0.15 0.25 rg 0 660 612 132 re f\n';
      operators += textOperator(48, 744, data.fullName, 25, 'F2', '1 1 1');
      operators += textOperator(48, 714, data.role, 12, 'F1', '0.88 0.92 0.97');
      const contact = [data.email, data.phone, data.location, data.linkedin]
        .filter(Boolean).join('  |  ');
      const contactLines = wrapText(contact, 94);
      let contactY = 688;
      for (const line of contactLines.slice(0, 2)) {
        operators += textOperator(48, contactY, line, 8.5, 'F1', '1 1 1');
        contactY -= 13;
      }
      cursorY = 632;
      firstPage = false;
    } else {
      operators += '0.07 0.15 0.25 rg 0 746 612 46 re f\n';
      operators += textOperator(48, 766, toAscii(data.fullName) + '  |  RESUME', 12, 'F2', '1 1 1');
      cursorY = 720;
    }
  }

  function ensureSpace(points) {
    if (cursorY - points < 54) startPage();
  }

  function addSection(title, value, options = {}) {
    const valueText = String(value || '').trim();
    if (!valueText) return;
    const lines = options.lines
      ? valueText.split(/\r?\n/).flatMap((line) => wrapText(line, 98))
      : wrapText(valueText, 98);
    ensureSpace(36 + lines.length * 13);
    operators += textOperator(48, cursorY, title.toUpperCase(), 10.5, 'F2', '0.08 0.22 0.36');
    cursorY -= 7;
    operators += '0.76 0.81 0.86 RG 0.7 w 48 ' + cursorY + ' m 564 ' + cursorY + ' l S\n';
    cursorY -= 17;
    for (const line of lines) {
      ensureSpace(14);
      if (line) operators += textOperator(50, cursorY, line, 9.5, 'F1');
      cursorY -= 13;
    }
    cursorY -= 8;
  }

  startPage();
  addSection('Professional Summary', data.summary);
  addSection('Core Skills', String(data.skills || '').split(/[,;|]/).map((s) => s.trim()).filter(Boolean).join('  |  '));
  addSection('Professional Experience', data.experience, { lines: true });
  addSection('Education', data.education, { lines: true });
  addSection('Certifications & Training', data.certifications, { lines: true });
  addSection('Languages', data.languages, { lines: true });

  if (operators) pages.push(operators);
  const pageCount = pages.length;
  const objects = new Array(5 + pageCount * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [' +
    Array.from({ length: pageCount }, (_, i) => (5 + i * 2) + ' 0 R').join(' ') +
    '] /Count ' + pageCount + ' >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

  for (let i = 0; i < pageCount; i += 1) {
    const pageId = 5 + i * 2;
    const contentId = pageId + 1;
    const footer = textOperator(500, 28, 'Page ' + (i + 1) + ' of ' + pageCount, 8, 'F1', '0.42 0.46 0.5');
    const stream = pages[i] + footer;
    objects[pageId] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + contentId + ' 0 R >>';
    objects[contentId] = '<< /Length ' + Buffer.byteLength(stream, 'ascii') + ' >>\nstream\n' +
      stream + 'endstream';
  }

  let pdf = '%PDF-1.4\n% English CV generated by Maloomat AI\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, 'ascii');
    pdf += id + ' 0 obj\n' + objects[id] + '\nendobj\n';
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let id = 1; id < objects.length; id += 1) {
    pdf += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' +
    xrefOffset + '\n%%EOF\n';
  return Buffer.from(pdf, 'ascii');
}

function makePdfFilename(name) {
  const slug = toAscii(name)
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'Candidate';
  return slug + '_CV.pdf';
}

function isStartCommand(text) {
  const normalized = String(text || '').trim().toLowerCase();
  return /^(?:\/?(?:cv|resume)|create\s+(?:an?\s+)?(?:cv|resume)|make\s+(?:an?\s+)?(?:cv|resume)|build\s+(?:an?\s+)?(?:cv|resume)|سي[\s-]?وي(?:\s+جوړ\s+کړه)?|سيرة\s+ذاتية)$/iu.test(normalized);
}

function isCancelCommand(text) {
  return /^(?:\/?cancel|\/?stop|لغوه|بس|بندول)$/iu.test(String(text || '').trim());
}

function isSkipCommand(text) {
  return /^(?:skip|none|n\/a|na|not applicable|نه لرم|نشته)$/iu.test(String(text || '').trim());
}

function validateField(field, value) {
  const ascii = toAscii(value);
  if (!ascii || !/[A-Za-z0-9]/.test(ascii)) {
    return 'مهرباني وکړه دا معلومات په انګلیسي تورو او شمېرو ولیکه.';
  }
  if (field.key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ascii)) {
    return 'Email سم نه ښکاري. مهرباني وکړه یو معتبر Email address ولیکه.';
  }
  if (field.key === 'phone' && !/^[+()0-9.\-\s]{6,30}$/.test(ascii)) {
    return 'د تلیفون شمېره د هېواد له کوډ سره په سم شکل ولیکه.';
  }
  return '';
}

function createCvService() {
  const sessions = new Map();

  async function handlePrivateCvMessage({ socket, jid, text, safeSend }) {
    if (typeof safeSend !== 'function' || !jid) return false;
    const messageText = cleanInput(text);
    const now = Date.now();
    const active = sessions.get(jid);

    if (active && now - active.updatedAt > SESSION_TTL_MS) {
      sessions.delete(jid);
    }

    if (isCancelCommand(messageText)) {
      sessions.delete(jid);
      await safeSend(socket, jid, { text: 'د CV جوړولو بهیر لغوه شو. د نوي CV لپاره CV ولیکه.' });
      return true;
    }

    if (isStartCommand(messageText)) {
      if (sessions.size >= MAX_ACTIVE_SESSIONS) {
        const oldest = sessions.keys().next().value;
        if (oldest) sessions.delete(oldest);
      }
      sessions.set(jid, { index: 0, data: {}, updatedAt: now });
      await safeSend(socket, jid, {
        text: '🌐 افغان AI — د انګلیسي CV جوړولو خدمت\n\nمعلومات یو په یو راولېږه. وروستی فایل به په انګلیسي PDF وي. مهرباني وکړه د CV معلومات په انګلیسي ولیکه.\n\nد اختیاري برخو د تېرولو لپاره SKIP او د لغوه کولو لپاره CANCEL ولیکه.\n\n' + CV_FIELDS[0].prompt,
      });
      return true;
    }

    const session = sessions.get(jid);
    if (!session) {
      await safeSend(socket, jid, {
        text: 'په شخصي چټ کې یوازې د انګلیسي CV جوړولو خدمت فعال دی. د پیل لپاره CV ولیکه.',
      });
      return true;
    }

    if (!messageText) {
      await safeSend(socket, jid, { text: 'مهرباني وکړه د روانې CV پوښتنې ځواب په انګلیسي راولېږه.' });
      return true;
    }
    if (messageText.length > MAX_FIELD_LENGTH) {
      await safeSend(socket, jid, { text: 'دا ځواب ډېر اوږد دی. مهرباني وکړه معلومات لنډ او تر ۱۸۰۰ تورو کم راولېږه.' });
      return true;
    }

    const field = CV_FIELDS[session.index];
    if (!field) {
      sessions.delete(jid);
      await safeSend(socket, jid, { text: 'د CV غونډه پای ته ورسېده. د نوي CV لپاره CV ولیکه.' });
      return true;
    }

    if (isSkipCommand(messageText)) {
      if (field.required) {
        await safeSend(socket, jid, { text: 'دا برخه اړینه ده؛ مهرباني وکړه معلومات ولیکه. که کاري تجربه نه لرې، د experience په برخه کې No professional experience yet ولیکه.' });
        return true;
      }
      session.data[field.key] = '';
    } else {
      const error = validateField(field, messageText);
      if (error) {
        await safeSend(socket, jid, { text: error });
        return true;
      }
      session.data[field.key] = messageText;
    }

    session.index += 1;
    session.updatedAt = now;
    const nextField = CV_FIELDS[session.index];
    if (nextField) {
      await safeSend(socket, jid, { text: nextField.prompt });
      return true;
    }

    const pdf = createCvPdf(session.data);
    const fileName = makePdfFilename(session.data.fullName);
    const sent = await safeSend(socket, jid, {
      document: pdf,
      mimetype: 'application/pdf',
      fileName,
      caption: '✅ Your English CV is ready. Please review all details before sending it to an employer.',
    });
    if (sent) {
      sessions.delete(jid);
    } else {
      await safeSend(socket, jid, {
        text: 'PDF ونه لېږل شو. مهرباني وکړه CV بیا ولیکه؛ د شخصي معلوماتو خوندي کولو لپاره به یې په فایل کې نه ساتم.',
      });
      sessions.delete(jid);
    }
    return true;
  }

  return { handlePrivateCvMessage };
}

const defaultService = createCvService();

module.exports = {
  CV_FIELDS,
  createCvPdf,
  createCvService,
  handlePrivateCvMessage: defaultService.handlePrivateCvMessage,
  isStartCommand,
  makePdfFilename,
};
