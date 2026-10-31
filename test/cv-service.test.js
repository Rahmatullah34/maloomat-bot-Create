'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createCvPdf,
  createCvService,
  isStartCommand,
  makePdfFilename,
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
  certifications: 'Office Administration Certificate - 2024',
  languages: 'Pashto - Native; English - Intermediate',
  linkedin: 'https://linkedin.com/in/sara-example',
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
  assert.match(text, /LANGUAGES/);
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
  assert.match(sent.at(-1).payload.text, /یوازې د انګلیسي CV/);

  await service.handlePrivateCvMessage({ socket, jid, text: 'CV', safeSend });
  assert.match(sent.at(-1).payload.text, /انګلیسي CV جوړولو خدمت/);

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
    'SKIP',
    sample.languages,
    'SKIP',
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
