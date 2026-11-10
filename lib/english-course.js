'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TIME_ZONE = 'Asia/Kabul';
const CHECK_INTERVAL_MS = 20 * 1000;
const SLOT_GRACE_MINUTES = 10;
const DEFAULT_STATE_PATH = path.resolve(process.cwd(), 'data', 'english-course-state.json');
const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'auto-publisher-config.json');
const DIGITS = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return /^(1|true|yes|on|enabled)$/iu.test(String(value).trim());
}

function getKabulTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    dateKey: values.year + '-' + values.month + '-' + values.day,
  };
}

function isValidDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(String(value || '')) &&
    Number.isFinite(Date.parse(String(value) + 'T00:00:00Z'));
}

function dayNumberFromStart(startDate, today) {
  if (!isValidDateKey(startDate) || !isValidDateKey(today)) return 1;
  const start = Date.parse(startDate + 'T00:00:00Z');
  const current = Date.parse(today + 'T00:00:00Z');
  return Math.floor((current - start) / 86400000) + 1;
}

function normalizeAnswer(value) {
  return String(value || '')
    .replace(/[۰-۹٠-٩]/gu, (digit) => DIGITS[digit] || digit)
    .toLocaleLowerCase('en')
    .replace(/[.,!?؟،؛:()[\]{}"“”'’]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function answerVariants(value) {
  return String(value || '')
    .split(/\s*\/\s*|\s+or\s+/iu)
    .map(normalizeAnswer)
    .filter(Boolean);
}

function defaultState() {
  return { version: 1, startDate: null, posts: {}, progress: {} };
}

function readState(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!parsed || parsed.version !== 1 ||
        typeof parsed.posts !== 'object' || typeof parsed.progress !== 'object') {
      throw new Error('د انګلیسي کورس د حالت فایل جوړښت ناسم دی.');
    }
    return parsed;
  } catch (error) {
    if (error && error.code === 'ENOENT') return defaultState();
    throw error;
  }
}

function writeState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const temporaryPath = statePath + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, statePath);
}

function readTargetConfig(env = process.env, configPath = DEFAULT_CONFIG_PATH) {
  let fileConfig = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) fileConfig = parsed;
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      return { enabled: false, groupJid: '', configError: String(error.message || error).slice(0, 250) };
    }
  }

  const allowedGroups = String(env.ALLOWED_GROUPS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const groupJid = String(
    env.ENGLISH_COURSE_GROUP_JID ||
    env.AUTO_POST_GROUP_JID ||
    fileConfig.groupJid ||
    (allowedGroups.length === 1 ? allowedGroups[0] : '')
  ).trim();
  const fallbackEnabled = parseBoolean(env.AUTO_POST_ENABLED, fileConfig.enabled === true);

  return {
    enabled: parseBoolean(env.ENGLISH_COURSE_ENABLED, fallbackEnabled),
    groupJid: /^[0-9-]+@g\.us$/u.test(groupJid) &&
      (allowedGroups.length === 0 || allowedGroups.includes(groupJid)) ? groupJid : '',
    configError: null,
  };
}

function isCourseCommand(text) {
  const value = String(text || '').trim();
  return /^(?:درس|تمرین|ازموینه|تکرار|مرسته)$/iu.test(value) ||
    /^ځواب\s*[:：]/iu.test(value);
}

function formatList(title, values, mapper) {
  if (!Array.isArray(values) || !values.length) return '';
  return title + '\n' + values.map((value, index) => mapper(value, index)).join('\n');
}

function createEnglishCourseService(options = {}) {
  const course = options.courseData || require('../data/english-beginner-30-day-course.json');
  const statePath = options.statePath || DEFAULT_STATE_PATH;
  const configPath = options.configPath || DEFAULT_CONFIG_PATH;
  const getEnv = options.getEnv || (() => process.env);
  const getConfig = options.getConfig || (() => readTargetConfig(getEnv(), configPath));
  const safeSend = options.safeSend || (async (socket, jid, content) => {
    if (!socket || typeof socket.sendMessage !== 'function') return null;
    return socket.sendMessage(jid, content);
  });

  let timer = null;
  let ticking = false;
  let lastTickAt = null;
  let lastResult = 'not-started';

  function getState() {
    return readState(statePath);
  }

  function getCurrentDay(state, now = new Date()) {
    const today = getKabulTimeParts(now).dateKey;
    const configuredStart = String(getEnv().ENGLISH_COURSE_START_DATE || '').trim();
    const startDate = state.startDate || (isValidDateKey(configuredStart) ? configuredStart : null);
    if (!startDate) return { day: 1, today, startDate: null, preview: true };
    return {
      day: dayNumberFromStart(startDate, today),
      today,
      startDate,
      preview: false,
    };
  }

  function findLesson(day) {
    return Array.isArray(course.lessons)
      ? course.lessons.find((lesson) => Number(lesson.day) === Number(day)) || null
      : null;
  }

  function formatLesson(day, preview = false) {
    const lesson = findLesson(day);
    if (!lesson) return '🏁 د ۳۰ ورځو د انګلیسي کورس ټول درسونه بشپړ شوي دي.';
    const vocab = formatList('📖 نوې کلمې:', lesson.vocab, (item, index) =>
      (index + 1) + '. ' + item[0] + ' — ' + item[1] + ' (تلفظ: ' + item[2] + ')');
    const examples = formatList('✍️ بېلګې:', lesson.examples, (item, index) =>
      (index + 1) + '. ' + item);
    const dialogue = formatList('💬 لنډه مکالمه:', lesson.dialogue, (item) => item);
    const practice = formatList('📝 د نن ورځې تمرین:', lesson.exercises, (item, index) =>
      (index + 1) + '. ' + item[0]);
    return [
      '📚 *Maloomat AI – English Learning Class*',
      '📅 ورځ: ' + lesson.day + ' له ۳۰ څخه',
      '📌 *موضوع: ' + lesson.topic + '*',
      preview ? 'ℹ️ دا د کورس د پیل تر مخه لومړنی مخکینی درس دی.' : '',
      '',
      '🎯 موخه: ' + lesson.goal,
      '',
      vocab,
      '',
      '📘 تشریح:',
      lesson.grammar || '',
      '',
      examples,
      '',
      dialogue,
      '',
      practice,
      '',
      '🏠 کورنۍ دنده: ' + (lesson.homework || ''),
      '',
      '📨 د تمرین ځواب داسې واستوئ: ځواب: 1 - Your answer',
      '🕗 د درس وخت: هره شپه ۸:۰۰، د افغانستان وخت',
    ].filter((line) => line !== '').join('\n');
  }

  function formatPractice(day) {
    const lesson = findLesson(day);
    if (!lesson) return 'د کورس ټول درسونه بشپړ شوي دي.';
    return [
      '📝 *د انګلیسي تمرین – ورځ ' + lesson.day + '*',
      'موضوع: ' + lesson.topic,
      'هرې پوښتنې ته جلا ځواب ورکړئ.',
      '',
      ...lesson.exercises.map((item, index) => (index + 1) + '. ' + item[0]),
      '',
      'د ځواب بڼه: ځواب: 1 - ستاسې ځواب',
      'د هرې پوښتنې لپاره یې شمېره بدله کړئ.',
    ].join('\n');
  }

  function formatQuiz(day) {
    const lesson = findLesson(day);
    if (!lesson) return 'د کورس ټول درسونه بشپړ شوي دي.';
    if (!lesson.quiz && !lesson.final) {
      const nextQuiz = course.lessons.find((item) => item.day > day && (item.quiz || item.final));
      return 'نن د اونۍ ازموینه نشته. عادي تمرین وکړئ.\nراتلونکې ازموینه: ' +
        (nextQuiz ? 'ورځ ' + nextQuiz.day + ' — ' + nextQuiz.topic : 'د کورس وروستۍ ازموینه.');
    }
    return [
      '🧪 *' + (lesson.final ? 'وروستۍ ازموینه' : 'د اونۍ ازموینه') + ' – ورځ ' + lesson.day + '*',
      'موضوع: ' + lesson.topic,
      'پوښتنې: ' + lesson.exercises.length,
      'د ځوابونو د سپارلو بڼه: ځواب: 1 - Your answer',
      '',
      ...lesson.exercises.map((item, index) => (index + 1) + '. ' + item[0]),
      '',
      lesson.final
        ? 'ټولې نمرې: ۵۰. وروستۍ لیکنیزه پوښتنه د ښوونکي کتنې ته اړتیا لري.'
        : 'ټولې نمرې: ۲۰. هره پوښتنه ۲ نمرې لري.',
    ].join('\n');
  }

  function formatReview(day) {
    if (day <= 1) return 'دا د کورس لومړۍ ورځ ده؛ تر اوسه پخوانی درس نشته. د «درس» امر وکاروئ.';
    const previous = findLesson(day - 1);
    if (!previous) return 'د تکرار لپاره پخوانی درس ونه موندل شو.';
    const vocab = (previous.vocab || []).slice(0, 5)
      .map((item, index) => (index + 1) + '. ' + item[0] + ' — ' + item[1]);
    const examples = (previous.examples || []).slice(0, 3);
    return [
      '🔁 *د تېر درس تکرار – ورځ ' + previous.day + '*',
      'موضوع: ' + previous.topic,
      '',
      '📖 مهمې کلمې:',
      ...vocab,
      '',
      '✍️ بېلګې:',
      ...examples,
      '',
      'د نوې موضوع لپاره «درس» ولیکئ.',
    ].join('\n');
  }

  function formatHelp() {
    return [
      '📚 *د انګلیسي کورس لارښود*',
      'درس — د نن ورځې بشپړ درس',
      'تمرین — د نن ورځې تمرینونه',
      'ازموینه — د اونۍ یا وروستۍ ازموینه',
      'تکرار — د تېر درس لنډ تکرار',
      'ځواب: 1 - Your answer — د یوې پوښتنې ځواب',
      'مرسته — د همدې لارښود بیا ښودل',
      '',
      'یادونه: د ځواب په امر کې د پوښتنې شمېره حتمي ولیکئ.',
    ].join('\n');
  }

  function scoreAnswer(state, groupJid, participantKey, day, questionNumber, submitted) {
    const lesson = findLesson(day);
    if (!lesson) return { type: 'missing-lesson' };
    const index = questionNumber - 1;
    const exercise = lesson.exercises[index];
    if (!exercise) return { type: 'bad-question-number', count: lesson.exercises.length };
    if (lesson.final && questionNumber === 16) {
      return {
        type: 'teacher-review',
        points: Number(lesson.mark_plan && lesson.mark_plan[index]) || 6,
      };
    }

    const accepted = answerVariants(exercise[1]);
    const correct = accepted.includes(normalizeAnswer(submitted));
    const userKey = String(participantKey || 'unknown-member').slice(0, 160);
    const groupProgress = state.progress[groupJid] || (state.progress[groupJid] = {});
    const member = groupProgress[userKey] || (groupProgress[userKey] = {});
    const dayProgress = member[String(day)] || (member[String(day)] = {});
    const key = String(questionNumber);
    const previous = dayProgress[key];
    const points = lesson.final
      ? Number(lesson.mark_plan && lesson.mark_plan[index]) || 0
      : lesson.quiz ? 2 : 1;

    if (!correct) {
      dayProgress[key] = {
        attempts: Number(previous && previous.attempts || 0) + 1,
        correct: Boolean(previous && previous.correct),
        points: Number(previous && previous.points || 0),
      };
      return { type: 'incorrect', correctAnswer: exercise[1], points: 0 };
    }

    if (previous && previous.correct) {
      dayProgress[key].attempts = Number(previous.attempts || 0) + 1;
      return { type: 'already-scored', points: 0, correctAnswer: exercise[1] };
    }

    dayProgress[key] = {
      attempts: Number(previous && previous.attempts || 0) + 1,
      correct: true,
      points,
      scoredAt: new Date().toISOString(),
    };
    return { type: 'correct', points, correctAnswer: exercise[1] };
  }

  async function handleCommand(socket, groupJid, text, context = {}) {
    const commandText = String(text || '').trim();
    if (!isCourseCommand(commandText)) return false;
    const config = getConfig();
    if (!config.groupJid || groupJid !== config.groupJid) return false;

    let state;
    try {
      state = getState();
    } catch (error) {
      await safeSend(socket, groupJid, {
        text: '⚠️ د انګلیسي کورس د معلوماتو د لوستلو ستونزه ده؛ د بوټ مدیر دې د حالت فایل وڅېړي.',
      });
      lastResult = 'state-read-error';
      return true;
    }

    const today = getCurrentDay(state);
    if (today.day < 1) {
      await safeSend(socket, groupJid, {
        text: '⏳ د کورس د پیل نېټه لا نه ده رسېدلې. د لومړي درس لپاره به د کورس په پیل کې خبر درکړل شي.',
      });
      return true;
    }
    if (today.day > 30) {
      await safeSend(socket, groupJid, {
        text: '🏁 د ۳۰ ورځو کورس پای ته رسېدلی دی. د نوې دورې د پیل لپاره د ګروپ له مدیر سره اړیکه ونیسئ.',
      });
      return true;
    }

    let response = '';
    if (commandText === 'درس') {
      response = formatLesson(today.day, today.preview);
    } else if (commandText === 'تمرین') {
      response = formatPractice(today.day);
    } else if (commandText === 'ازموینه') {
      response = formatQuiz(today.day);
    } else if (commandText === 'تکرار') {
      response = formatReview(today.day);
    } else if (commandText === 'مرسته') {
      response = formatHelp();
    } else if (/^ځواب\s*[:：]/iu.test(commandText)) {
      const match = commandText.match(/^ځواب\s*[:：]\s*([0-9۰-۹٠-٩]{1,2})\s*(?:[-).:：]\s*)?(.+)$/iu);
      if (!match) {
        response = 'د ځواب سمه بڼه دا ده: ځواب: 1 - I am a student.';
      } else {
        const number = Number(match[1].replace(/[۰-۹٠-٩]/gu, (digit) => DIGITS[digit] || digit));
        const submitted = String(match[2] || '').trim();
        const result = scoreAnswer(state, groupJid, context.participantKey, today.day, number, submitted);
        if (result.type === 'teacher-review') {
          response = '📝 ستاسې لیکنه ثبت شوه. دا ازاده لیکنیزه پوښتنه ده؛ د ' + result.points +
            ' نمرو وروستۍ ارزونه د ښوونکي له خوا کېږي، نو بوټ په خپله نمره نه ټاکي.';
        } else if (result.type === 'bad-question-number') {
          response = '⚠️ د پوښتنې شمېره له ۱ تر ' + result.count + ' پورې وټاکئ.';
        } else if (result.type === 'incorrect') {
          response = '❌ دا ځواب سم نه دی. سم ځواب: ' + result.correctAnswer +
            '\nبیا هڅه وکړئ؛ د سم ځواب لپاره نمره یو ځل ثبتېږي.';
        } else if (result.type === 'already-scored') {
          response = '✅ دا پوښتنه مخکې سمه حل شوې او نمره یې ثبت شوې ده؛ بیا نمره نه زیاتېږي.';
        } else if (result.type === 'correct') {
          response = '✅ ډېر ښه! ځواب مو سم دی.\n⭐ د دې پوښتنې نمرې: ' + result.points +
            '\nستاسې نمره د همدې ورځې لپاره یو ځل ثبت شوه.';
        } else {
          response = '⚠️ پوښتنه ونه موندل شوه؛ «تمرین» ولیکئ.';
        }
        writeState(statePath, state);
      }
    }

    const prefix = context.name ? '👤 ' + String(context.name).slice(0, 60) + '،\n\n' : '';
    await safeSend(socket, groupJid, { text: prefix + response });
    return true;
  }

  async function tick(getSocket, now = new Date()) {
    const config = getConfig();
    if (config.configError) {
      lastResult = 'config-read-error';
      console.error('❌ د انګلیسي کورس تنظیماتي فایل ستونزه لري:', config.configError);
      return;
    }
    if (!config.enabled) {
      lastResult = 'disabled-by-config';
      return;
    }
    if (!config.groupJid) {
      lastResult = 'waiting-for-valid-course-group';
      return;
    }

    const local = getKabulTimeParts(now);
    const minuteOfDay = local.hour * 60 + local.minute;
    const delta = minuteOfDay - (20 * 60);
    if (delta < 0 || delta >= SLOT_GRACE_MINUTES) {
      lastResult = 'waiting-for-20-00-slot';
      return;
    }

    let state;
    try {
      state = getState();
    } catch (error) {
      lastResult = 'state-read-error';
      console.error('❌ د انګلیسي کورس حالت ولوستل نه شو:', error.message);
      return;
    }

    const slotId = local.dateKey + '@20:00';
    const existing = state.posts[slotId];
    if (existing && ['sent', 'sending', 'failed', 'uncertain'].includes(existing.status)) {
      lastResult = existing.status === 'sent' ? 'already-sent-today' : 'slot-already-attempted';
      return;
    }

    const socket = typeof getSocket === 'function' ? getSocket() : null;
    if (!socket) {
      lastResult = 'waiting-for-whatsapp-connection';
      return;
    }

    if (!state.startDate) {
      const configuredStart = String(getEnv().ENGLISH_COURSE_START_DATE || '').trim();
      state.startDate = isValidDateKey(configuredStart) ? configuredStart : local.dateKey;
    }
    const day = dayNumberFromStart(state.startDate, local.dateKey);
    if (day > 30) {
      lastResult = 'course-completed';
      return;
    }
    if (day < 1) {
      lastResult = 'waiting-for-course-start-date';
      return;
    }

    state.posts[slotId] = {
      status: 'sending',
      day,
      startedAt: new Date().toISOString(),
      group: config.groupJid,
    };
    try {
      writeState(statePath, state);
    } catch (error) {
      lastResult = 'state-write-error';
      console.error('❌ د انګلیسي درس د لېږلو حالت خوندي نه شو؛ پیغام نه لېږل کېږي:', error.message);
      return;
    }

    try {
      const response = await safeSend(socket, config.groupJid, { text: formatLesson(day, false) });
      if (!response) throw new Error('د WhatsApp لېږلو تایید ترلاسه نه شو.');
      state.posts[slotId].status = 'sent';
      state.posts[slotId].sentAt = new Date().toISOString();
      writeState(statePath, state);
      lastResult = 'sent';
      console.log('✅ د انګلیسي کورس درس خپور شو:', slotId, 'ورځ=' + day);
    } catch (error) {
      state.posts[slotId].status = 'failed';
      state.posts[slotId].error = String(error && error.message ? error.message : error).slice(0, 250);
      try { writeState(statePath, state); } catch (saveError) {
        console.error('❌ د انګلیسي کورس د ناکام لېږلو حالت خوندي نه شو:', saveError.message);
      }
      lastResult = 'send-failed';
      console.error('❌ د انګلیسي درس خپرول ناکام شول:', error.message || error);
    }
  }

  function getStatus(now = new Date()) {
    const config = getConfig();
    let state = defaultState();
    try { state = getState(); } catch {}
    const current = getCurrentDay(state, now);
    return {
      enabled: config.enabled,
      timeZone: TIME_ZONE,
      schedule: '20:00',
      targetConfigured: Boolean(config.groupJid),
      targetCount: config.groupJid ? 1 : 0,
      started: Boolean(state.startDate),
      startDate: state.startDate,
      currentDay: current.day,
      running: Boolean(timer),
      lastTickAt,
      lastResult,
    };
  }

  function start(getSocket) {
    if (timer) return getStatus();
    if (typeof getSocket !== 'function') throw new TypeError('getSocket باید function وي.');
    lastResult = getConfig().enabled ? 'scheduler-started' : 'disabled-by-config';
    const runTick = async () => {
      if (ticking) return;
      ticking = true;
      lastTickAt = new Date().toISOString();
      try {
        await tick(getSocket, new Date());
      } catch (error) {
        lastResult = 'unexpected-error';
        console.error('❌ د انګلیسي کورس مهال‌وېش کې ستونزه:', error && error.stack ? error.stack : error);
      } finally {
        ticking = false;
      }
    };
    timer = setInterval(runTick, CHECK_INTERVAL_MS);
    if (typeof timer.unref === 'function') timer.unref();
    runTick().catch(() => {});
    console.log('🗓️ د انګلیسي کورس مهال‌وېش:', JSON.stringify(getStatus()));
    return getStatus();
  }

  return {
    handleCommand,
    tick,
    start,
    getStatus,
    formatLesson,
    formatPractice,
    formatQuiz,
    formatReview,
  };
}

module.exports = {
  TIME_ZONE,
  getKabulTimeParts,
  dayNumberFromStart,
  normalizeAnswer,
  answerVariants,
  isCourseCommand,
  readTargetConfig,
  createEnglishCourseService,
};
