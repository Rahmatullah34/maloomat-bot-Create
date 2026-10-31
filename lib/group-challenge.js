'use strict';

const { runtimeConfig, readOpenRouterApiKey } = require('./runtime-config');

const ACTIVE_TTL_MS = 20 * 60 * 1000;
const MAX_GROUPS = 300;

function clean(value, limit = 500) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, limit);
}

function normalizeDigits(value) {
  return String(value || '').replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x0660 && code <= 0x0669 ? code - 0x0660 : code - 0x06F0);
  });
}

function command(value) {
  return clean(normalizeDigits(value), 100).normalize('NFKC').toLowerCase()
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[؟?!.,،]/g, '').trim();
}

function isStartCommand(value) {
  return /^(?:quiz|group quiz|start quiz|سیالی|علمی سیالی|پوښتنیزه سیالی)$/iu.test(command(value));
}

function isScoreCommand(value) {
  return /^(?:نمرې|نمرى|جدول|leaderboard|scores|score)$/iu.test(command(value));
}

function parseAnswer(value) {
  const match = command(value).match(/^ځواب\s+([a-d1-4])$/iu);
  if (!match) return '';
  const answer = match[1].toUpperCase();
  return /^[1-4]$/.test(answer) ? String.fromCharCode(64 + Number(answer)) : answer;
}

function parseJson(value) {
  const fence = String.fromCharCode(96).repeat(3);
  const source = String(value || '').trim()
    .replace(new RegExp('^' + fence + '(?:json)?\\s*', 'i'), '')
    .replace(new RegExp('\\s*' + fence + '$'), '');
  const parsed = JSON.parse(source);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

async function generateGroupQuestion(options = {}) {
  const key = String(options.apiKey || readOpenRouterApiKey()).trim();
  if (!key) return null;
  try {
    const response = await (options.fetchImpl || fetch)('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        'X-Title': 'Afghan AI Group Quiz',
      },
      body: JSON.stringify({
        model: options.model || runtimeConfig.ai.model || 'openai/gpt-6-luna',
        temperature: 0.3,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Generate one clear, culturally neutral general-knowledge multiple-choice quiz question in Pashto. Return JSON exactly: {"question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"A","explanation":"..."}. Only one option is correct. Avoid disputed or time-sensitive facts, trick questions, politics, sectarian or sensitive topics. Use well-established knowledge.',
          },
          { role: 'user', content: 'Create one suitable general knowledge question for a WhatsApp group.' },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    const raw = body?.choices?.[0]?.message?.content;
    const value = parseJson(raw);
    if (!value) return null;
    const optionsMap = Object.fromEntries(['A', 'B', 'C', 'D'].map((letter) => [letter, clean(value.options?.[letter], 250)]));
    const answer = String(value.answer || '').trim().toUpperCase();
    if (!clean(value.question, 500) || ['A', 'B', 'C', 'D'].some((letter) => !optionsMap[letter]) ||
        !['A', 'B', 'C', 'D'].includes(answer)) return null;
    return {
      question: clean(value.question, 500),
      options: optionsMap,
      answer,
      explanation: clean(value.explanation, 500),
    };
  } catch (error) {
    console.warn('⚠️ د ګروپي سیالۍ پوښتنه جوړه نه شوه:', error?.message || error);
    return null;
  }
}

function createGroupChallengeService(options = {}) {
  const active = new Map();
  const scores = new Map();
  const makeQuestion = options.generateQuestion || (() => generateGroupQuestion(options));

  function getScores(groupJid) {
    if (!scores.has(groupJid)) scores.set(groupJid, new Map());
    return scores.get(groupJid);
  }

  async function handleGroupChallengeMessage(args = {}) {
    const {
      socket, jid, text, senderId, senderName, isAdmin, safeSend,
    } = args;
    if (!jid || typeof safeSend !== 'function') return false;

    const value = clean(text, 500);
    if (isStartCommand(value)) {
      if (!isAdmin) {
        await safeSend(socket, jid, { text: '🏆 د ګروپي علمي سیالۍ د پیل اجازه یوازې د ګروپ مدیر لري.' });
        return true;
      }
      const current = active.get(jid);
      if (current && current.expiresAt > Date.now()) {
        await safeSend(socket, jid, { text: 'اوسنۍ سیالي لا فعاله ده. غړي دې ځوابونه د «ځواب A» یا «ځواب 1» په بڼه واستوي؛ د نمراتو لپاره «نمرې» ولیکئ.' });
        return true;
      }
      const question = await makeQuestion();
      if (!question) {
        await safeSend(socket, jid, { text: 'د سیالۍ پوښتنه دا ځل جوړه نه شوه. لږ وروسته بیا «سیالي» ولیکئ.' });
        return true;
      }
      active.set(jid, { question, expiresAt: Date.now() + ACTIVE_TTL_MS, answered: new Set() });
      while (active.size > MAX_GROUPS) {
        const oldest = active.keys().next().value;
        if (!oldest) break;
        active.delete(oldest);
      }
      const optionsText = ['A', 'B', 'C', 'D']
        .map((letter) => letter + ') ' + question.options[letter]).join('\n');
      await safeSend(socket, jid, {
        text: '🏆 *د افغان AI علمي سیالي پیل شوه!*\n\n' +
          question.question + '\n\n' + optionsText +
          '\n\nځواب د «ځواب A» یا «ځواب 1» په بڼه واستوئ. هر غړی یوازې یو ځل ځواب ورکولای شي. موده: ۲۰ دقیقې.',
      });
      return true;
    }

    if (isScoreCommand(value)) {
      const board = [...getScores(jid).entries()]
        .sort((a, b) => b[1].points - a[1].points || a[1].name.localeCompare(b[1].name))
        .slice(0, 10);
      if (!board.length) {
        await safeSend(socket, jid, { text: '📊 تر اوسه د دې ګروپ نمرې نشته. د سیالۍ د پیل لپاره له مدیر څخه وغواړئ «سیالي» ولیکي.' });
      } else {
        await safeSend(socket, jid, {
          text: '🏆 *د ګروپ د علمي سیالۍ نمرې*\n\n' +
            board.map((entry, index) => (index + 1) + '. ' + entry[1].name + ' — ' + entry[1].points + ' نمرې').join('\n'),
        });
      }
      return true;
    }

    const answer = parseAnswer(value);
    if (!answer) return false;
    const current = active.get(jid);
    if (!current || current.expiresAt <= Date.now()) {
      active.delete(jid);
      return false;
    }
    const participant = clean(senderId, 180);
    if (!participant) return false;
    if (current.answered.has(participant)) {
      await safeSend(socket, jid, { text: 'دا غړی په دې پړاو کې مخکې ځواب ورکړی دی.' });
      return true;
    }
    current.answered.add(participant);
    const correct = answer === current.question.answer;
    const board = getScores(jid);
    const existing = board.get(participant) || { name: clean(senderName || 'ګډونوال', 80), points: 0 };
    existing.name = clean(senderName || existing.name, 80);
    if (correct) existing.points += 1;
    board.set(participant, existing);
    await safeSend(socket, jid, {
      text: (correct ? '✅ آفرین، ' + existing.name + '! سم ځواب دې ورکړ؛ ۱ نمره دې واخیسته.' :
        '❌ ' + existing.name + '! دا ځل سم نه و. سم ځواب: ' + current.question.answer + '.') +
        (current.question.explanation ? '\n\n💡 ' + current.question.explanation : '') +
        '\n\nد نمراتو جدول: «نمرې»',
    });
    return true;
  }

  return { handleGroupChallengeMessage, active, scores };
}

const defaultService = createGroupChallengeService();

module.exports = {
  createGroupChallengeService,
  handleGroupChallengeMessage: defaultService.handleGroupChallengeMessage,
  generateGroupQuestion,
  parseAnswer,
  isStartCommand,
  isScoreCommand,
};
