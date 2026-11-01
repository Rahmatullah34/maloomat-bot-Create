'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createCareerService,
  isCvCommand,
  isCoverLetterCommand,
  isInterviewCommand,
  isMenuCommand,
} = require('../lib/career-service');

function harness(overrides = {}) {
  const sends = [];
  const calls = { cv: [], letters: [], questions: [], reviews: [] };
  const safeSend = async (_socket, jid, payload) => {
    sends.push({ jid, payload });
    return true;
  };
  const service = createCareerService({
    handlePrivateCvMessage: async (args) => {
      calls.cv.push(args);
      await args.safeSend(args.socket, args.jid, { text: 'CV prompt' });
      return true;
    },
    generateCoverLetter: async (data) => {
      calls.letters.push({ ...data });
      return overrides.generateCoverLetter
        ? overrides.generateCoverLetter(data, calls.letters.length)
        : 'Dear Hiring Manager,\n\nI am applying for the advertised role. My background and skills are described below. I would welcome the opportunity to discuss my application.\n\nSincerely,\nApplicant';
    },
    generateInterviewQuestion: async (data) => {
      calls.questions.push({ ...data });
      return 'How would you approach this responsibility?';
    },
    evaluateInterviewAnswer: async (data) => {
      calls.reviews.push({ ...data });
      return {
        feedback: 'A clear answer.',
        strengths: 'You explained your approach.',
        improvement: 'Add a specific example from your real experience.',
        sampleAnswer: 'I would explain my actual steps and give a truthful example.',
        nextQuestion: data.questionNumber < 5 ? 'Describe how you solve a difficult work problem.' : '',
      };
    },
    ...overrides,
  });
  const args = { socket: {}, jid: '15551234567@s.whatsapp.net', safeSend };
  async function send(text) {
    return service.handlePrivateCareerMessage({ ...args, text });
  }
  return { service, sends, calls, send, args };
}

test('recognizes the career menu and its three service commands', () => {
  assert.equal(isMenuCommand('CAREER'), true);
  assert.equal(isCvCommand('CV PLUS'), true);
  assert.equal(isCoverLetterCommand('Cover Letter'), true);
  assert.equal(isInterviewCommand('د مرکې تمرین'), true);
});

test('shows the private employment menu and starts the existing CV flow', async () => {
  const h = harness();
  await h.send('CAREER');
  assert.match(h.sends.at(-1).payload.text, /CV پلس/);
  assert.match(h.sends.at(-1).payload.text, /Cover Letter/);
  assert.match(h.sends.at(-1).payload.text, /Interview/);

  await h.send('1');
  assert.equal(h.calls.cv.length, 1);
  assert.equal(h.calls.cv[0].text, 'CV');
  assert.match(h.sends.at(-1).payload.text, /CV prompt/);
});

test('collects cover-letter details in native language and retries without asking again', async () => {
  let generationCalls = 0;
  const hCalls = [];
  const h = harness({
    generateCoverLetter: async (data) => {
      generationCalls += 1;
      hCalls.push({ ...data });
      return generationCalls === 1 ? null : 'Dear Hiring Manager,\n\nI am applying for this role. My education and relevant skills are described accurately in this letter. I would welcome an interview.\n\nSincerely,\nApplicant';
    },
  });

  await h.send('COVER LETTER');
  await h.send('د ښوونکي دنده، د ABC ښوونځی');
  await h.send('زه د دولسم ټولګي فارغ یم او درې کاله مې تدریس کړی.');
  await h.send('تدریس، د ټولګي مدیریت');
  assert.match(h.sends.at(-1).payload.text, /RETRY/);
  assert.equal(hCalls.length, 1);
  assert.equal(hCalls[0].target, 'د ښوونکي دنده، د ABC ښوونځی');

  await h.send('RETRY');
  assert.match(h.sends.at(-1).payload.text, /English Cover Letter/);
  assert.equal(hCalls.length, 2);
  assert.equal(generationCalls, 2);
  assert.equal(hCalls[0].candidate, hCalls[1].candidate);
});

test('allows the optional skills/achievements field to be skipped', async () => {
  const h = harness();
  await h.send('COVER LETTER');
  await h.send('Accountant at Example Company');
  await h.send('I studied accounting.');
  await h.send('نه لرم');
  assert.equal(h.calls.letters.length, 1);
  assert.equal(h.calls.letters[0].evidence, '');
  assert.match(h.sends.at(-1).payload.text, /English Cover Letter/);
});

test('runs a five-question interview and evaluates each applicant answer', async () => {
  const h = harness();
  await h.send('INTERVIEW');
  await h.send('Administrative Assistant');
  await h.send('I have two years of office experience.');
  await h.send('3');
  assert.equal(h.calls.questions.length, 1);
  assert.equal(h.calls.questions[0].language, 'English');
  assert.match(h.sends.at(-1).payload.text, /۱\/۵/);

  for (let i = 0; i < 5; i += 1) {
    await h.send('I would organize the task, communicate with the team, and check the result.');
  }

  assert.equal(h.calls.reviews.length, 5);
  assert.equal(h.calls.reviews[4].requestNextQuestion, false);
  assert.match(h.sends.at(-1).payload.text, /تمرین بشپړ شو/);
});

test('retries a failed interview review using the saved answer', async () => {
  let calls = 0;
  const h = harness({
    evaluateInterviewAnswer: async () => {
      calls += 1;
      if (calls === 1) return null;
      return {
        feedback: 'ښه ځواب.',
        strengths: 'روښانه بیان.',
        improvement: 'واقعي مثال زیات کړه.',
        sampleAnswer: '',
        nextQuestion: 'دویمه پوښتنه څه ده؟',
      };
    },
  });
  await h.send('INTERVIEW');
  await h.send('Teacher');
  await h.send('Five years of teaching');
  await h.send('1');
  await h.send('د زده‌کوونکو اړتیاوې ارزوم او درس ورته برابروم.');
  assert.match(h.sends.at(-1).payload.text, /RETRY/);
  await h.send('RETRY');
  assert.match(h.sends.at(-1).payload.text, /دویمه پوښتنه/);
  assert.equal(calls, 2);
});

test('CANCEL ends any career flow and returns the user to the menu state', async () => {
  const h = harness();
  await h.send('INTERVIEW');
  await h.send('CANCEL');
  assert.match(h.sends.at(-1).payload.text, /لغوه شو/);
  await h.send('hello');
  assert.match(h.sends.at(-1).payload.text, /۱، ۲ یا ۳/);
});
