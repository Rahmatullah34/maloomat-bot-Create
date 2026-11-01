'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createCvPdf,
  createCvService,
  isStartCommand,
  makePdfFilename,
  normalizeDigits,
  translateCvToEnglish,
} = require('../lib/cv-service');

const sample = {
  fullName: 'Sara Ahmad',
  role: 'Administrative Assistant',
  email: 'sara@example.com',
  phone: '+1 202 555 0100',
  location: 'New York, USA',
  summary: 'Organized administrative professional with strong communication and office coordination skills.',
  skills: 'Microsoft Office, Scheduling, Customer Service',
  experience: 'Administrative Assistant - Example Company\\n2022-2025 - Managed calendars and records.',
  education: 'Bachelor of Business Administration - Example University - 2022',
  otherDetails: 'Office Administration Certificate - 2024\nPashto - Native; English - Intermediate\nhttps://linkedin.com/in/sara-example',
};

test('recognizes English and Pashto CV start commands, but not ordinary questions', () => {
  assert.equal(isStartCommand('CV'), true);
  assert.equal(isStartCommand('create a resume'), true);
  assert.equal(isStartCommand('سي وي جوړ کړه'), true);
  assert.equal(isStartCommand('What is the weather?'), false);
});

test('creates a valid English PDF containing the supplied CV sections', () => {
  const pdf = createCvPdf(sample);
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 8).toString('ascii'), '%PDF-1.4');
  const text = pdf.toString('ascii');
  assert.match(text, /Sara Ahmad/);
  assert.match(text, /PROFESSIONAL SUMMARY/);
  assert.match(text, /CORE SKILLS/);
  assert.match(text, /PROFESSIONAL EXPERIENCE/);
  assert.match(text, /EDUCATION/);
  assert.match(text, /ADDITIONAL INFORMATION/);
  assert.match(text, /sara@example\.com/);
  assert.match(makePdfFilename(sample.fullName), /^Sara_Ahmad_CV\.pdf$/);
});

test('collects the CV step by step and sends a PDF without answering general questions', async () => {
  const service = createCvService();
  const sent = [];
  const safeSend = async (_socket, jid, payload) => {
    sent.push({ jid, payload });
    return true;
  };
  const socket = {};
  const jid = '15551234567@s.whatsapp.net';

  await service.handlePrivateCvMessage({ socket, jid, text: 'سلام', safeSend });
  assert.match(sent.at(-1).payload.text, /د پیل لپاره CV ولیکه/);

  await service.handlePrivateCvMessage({ socket, jid, text: 'CV', safeSend });
  assert.match(sent.at(-1).payload.text, /۱۰ لنډې پوښتنې/);

  const answers = [
    sample.fullName,
    sample.role,
    sample.email,
    sample.phone,
    sample.location,
    sample.summary,
    sample.skills,
    sample.experience.replace(/\\n/g, '\n'),
    sample.education,
    sample.otherDetails,
  ];
  for (const answer of answers) {
    await service.handlePrivateCvMessage({ socket, jid, text: answer, safeSend });
  }

  const documentMessage = sent.find((item) => item.payload.document);
  assert.ok(documentMessage, 'expected a PDF document to be sent');
  assert.equal(documentMessage.jid, jid);
  assert.equal(documentMessage.payload.mimetype, 'application/pdf');
  assert.match(documentMessage.payload.fileName, /_CV\.pdf$/);
  assert.equal(documentMessage.payload.document.subarray(0, 8).toString('ascii'), '%PDF-1.4');

  await service.handlePrivateCvMessage({ socket, jid, text: 'Tell me a fact?', safeSend });
  assert.match(sent.at(-1).payload.text, /یوازې د انګلیسي CV/);
});

test('requires an email address and allows optional sections to be skipped', async () => {
  const service = createCvService();
  const sent = [];
  const safeSend = async (_socket, jid, payload) => {
    sent.push(payload);
    return true;
  };
  const args = { socket: {}, jid: '12345@s.whatsapp.net', safeSend };

  await service.handlePrivateCvMessage({ ...args, text: 'CV' });
  await service.handlePrivateCvMessage({ ...args, text: 'Alex Example' });
  await service.handlePrivateCvMessage({ ...args, text: 'Office Manager' });
  await service.handlePrivateCvMessage({ ...args, text: 'not-an-email' });
  assert.match(sent.at(-1).text, /معتبر Email/);
  await service.handlePrivateCvMessage({ ...args, text: 'alex@example.com' });
  assert.match(sent.at(-1).text, /د اړیکې شمېره/);
});

test('accepts Pashto CV answers and sends an English PDF after translation', async () => {
  let received;
  const translated = {
    fullName: 'Rahmatullah Almi',
    role: 'Teacher',
    location: 'Kabul, Afghanistan',
    summary: 'Experienced teacher with five years of classroom experience.',
    skills: 'Teaching, Classroom Management, Communication',
    experience: 'Worked as a teacher for five years.',
    education: 'High School Graduate',
    otherDetails: 'Computer Course; Pashto - Native; Dari - Fluent',
  };
  const service = createCvService({
    translateCv: async (data) => {
      received = { ...data };
      return { ...data, ...translated };
    },
  });
  const sent = [];
  const safeSend = async (_socket, jid, payload) => {
    sent.push({ jid, payload });
    return true;
  };
  const args = { socket: {}, jid: '937000000000@s.whatsapp.net', safeSend };

  await service.handlePrivateCvMessage({ ...args, text: 'CV' });
  const answers = [
    'رحمت الله عالمي',
    'ښوونکی',
    'rahmat@example.com',
    '+۹۳۷۰۰۰۰۰۰۰۰۰',
    'کابل، افغانستان',
    'زه پنځه کاله د ښوونې تجربه لرم.',
    'تدریس، کمپیوټر، د ټولګي مدیریت',
    'ما په یوه ښوونځي کې پنځه کاله تدریس کړی.',
    'د دولسم ټولګي فارغ',
    'د کمپیوټر کورس؛ پښتو او دري',
  ];
  for (const answer of answers) {
    await service.handlePrivateCvMessage({ ...args, text: answer });
  }

  assert.equal(received.fullName, 'رحمت الله عالمي');
  assert.equal(received.role, 'ښوونکی');
  assert.equal(received.phone, '+937000000000');
  const documentMessage = sent.find((item) => item.payload.document);
  assert.ok(documentMessage);
  const pdfText = documentMessage.payload.document.toString('ascii');
  assert.match(pdfText, /Rahmatullah Almi/);
  assert.match(pdfText, /Kabul, Afghanistan/);
  assert.match(pdfText, /High School Graduate/);
  assert.doesNotMatch(pdfText, /[\u0600-\u06FF]/);
});

test('translates multilingual CV values while preserving email and phone', async () => {
  let requestUrl = '';
  let requestBody;
  const source = {
    fullName: 'رحمت الله',
    role: 'ښوونکی',
    email: 'rahmat@example.com',
    phone: '+937000000000',
    location: 'کابل، افغانستان',
    summary: 'زه ښوونکی یم.',
    skills: 'تدریس',
    experience: 'پنځه کاله تجربه',
    education: 'د دولسم ټولګي فارغ',
    otherDetails: '',
  };
  const translated = {
    fullName: 'Rahmatullah',
    role: 'Teacher',
    location: 'Kabul, Afghanistan',
    summary: 'I am a teacher.',
    skills: 'Teaching',
    experience: 'Five years of experience',
    education: 'High school graduate',
    otherDetails: '',
  };
  const result = await translateCvToEnglish(source, {
    apiKey: 'test-api-key',
    model: 'test-model',
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(translated) } }] }),
      };
    },
  });
  assert.equal(requestUrl, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(requestBody.model, 'test-model');
  assert.equal(result.fullName, 'Rahmatullah');
  assert.equal(result.role, 'Teacher');
  assert.equal(result.email, source.email);
  assert.equal(result.phone, source.phone);
  assert.equal(result.location, 'Kabul, Afghanistan');
});

test('cancel removes the active CV session', async () => {
  const service = createCvService();
  const sent = [];
  const safeSend = async (_socket, _jid, payload) => { sent.push(payload); return true; };
  const args = { socket: {}, jid: '12345@s.whatsapp.net', safeSend };
  await service.handlePrivateCvMessage({ ...args, text: 'CV' });
  await service.handlePrivateCvMessage({ ...args, text: 'CANCEL' });
  assert.match(sent.at(-1).text, /لغوه شو/);
  await service.handlePrivateCvMessage({ ...args, text: 'Alex Example' });
  assert.match(sent.at(-1).text, /یوازې د انګلیسي CV/);
});

test('normalizes Pashto and Arabic phone digits into ASCII digits', () => {
  assert.equal(normalizeDigits('+۹۳۷۰۰۰۰۰۰۰۰۰'), '+937000000000');
  assert.equal(normalizeDigits('+٩٣٧٠٠٠٠٠٠٠٠٠'), '+937000000000');
});
