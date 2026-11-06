'use strict';

const fs = require('fs');
const path = require('path');

const MINUTE_MS = 60 * 1000;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) return fallback;
  return Math.min(parsed, max);
}

function makeLimiterError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createShamelaRateLimiter(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const storePath = path.resolve(
    String(options.storePath || path.join(process.cwd(), 'data', 'shamela-rate-limit.json'))
  );
  const maxRequestsPerMinute = boundedInteger(
    options.maxRequestsPerMinute ?? process.env.SHAMELA_MAX_REQUESTS_PER_MINUTE,
    7,
    1,
    9,
  );
  const maxRequestsPerDay = boundedInteger(
    options.maxRequestsPerDay ?? process.env.SHAMELA_MAX_REQUESTS_PER_DAY,
    150,
    1,
    199,
  );
  const maxPendingRequests = boundedInteger(options.maxPendingRequests, 30, 1, 200);

  let queue = Promise.resolve();
  let queuedRequests = 0;

  function todayUtc(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  function readState(timestamp) {
    let state;
    try {
      state = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return {
          version: 1,
          day: todayUtc(timestamp),
          dailyRequests: 0,
          recentRequests: [],
        };
      }
      throw makeLimiterError(
        'SHAMELA_RATE_STATE_UNREADABLE',
        'د Shamela د غوښتنو د محدودیت ثبت نه شي لوستل کېدای؛ د خونديتوب لپاره نوې غوښتنه بنده شوه.'
      );
    }

    if (
      !state ||
      state.version !== 1 ||
      typeof state.day !== 'string' ||
      !Number.isInteger(state.dailyRequests) ||
      state.dailyRequests < 0 ||
      !Array.isArray(state.recentRequests) ||
      state.recentRequests.some(value => !Number.isFinite(value))
    ) {
      throw makeLimiterError(
        'SHAMELA_RATE_STATE_INVALID',
        'د Shamela د غوښتنو د محدودیت ثبت ناسم دی؛ د خونديتوب لپاره نوې غوښتنه بنده شوه.'
      );
    }

    const currentDay = todayUtc(timestamp);
    if (state.day !== currentDay) {
      state.day = currentDay;
      state.dailyRequests = 0;
    }

    state.recentRequests = state.recentRequests
      .filter(value => timestamp - value < MINUTE_MS)
      .sort((a, b) => a - b);

    return state;
  }

  function writeState(state) {
    const directory = path.dirname(storePath);
    const temporaryPath = storePath + '.' + process.pid + '.' + Date.now() + '.tmp';
    fs.mkdirSync(directory, { recursive: true });
    try {
      fs.writeFileSync(
        temporaryPath,
        JSON.stringify(state),
        { encoding: 'utf8', mode: 0o600 },
      );
      fs.renameSync(temporaryPath, storePath);
    } catch (error) {
      try {
        fs.rmSync(temporaryPath, { force: true });
      } catch {
        // Preserve the original persistence error.
      }
      throw makeLimiterError(
        'SHAMELA_RATE_STATE_WRITE_FAILED',
        'د Shamela د غوښتنو د محدودیت ثبت خوندي نه شو؛ د خونديتوب لپاره نوې غوښتنه ونه لېږل شوه.'
      );
    }
  }

  async function reservePermit() {
    while (true) {
      const timestamp = now();
      const state = readState(timestamp);

      if (state.dailyRequests >= maxRequestsPerDay) {
        throw makeLimiterError(
          'SHAMELA_DAILY_LIMIT',
          'د Shamela د ورځې خوندي محلي حد پوره شوی؛ نوې پلټنه به د UTC د بلې ورځې تر پیل پورې ونه لېږل شي.'
        );
      }

      if (state.recentRequests.length >= maxRequestsPerMinute) {
        const waitMilliseconds = Math.max(
          10,
          state.recentRequests[0] + MINUTE_MS - timestamp + 5,
        );
        await sleep(waitMilliseconds);
        continue;
      }

      state.recentRequests.push(timestamp);
      state.dailyRequests += 1;
      writeState(state);
      return;
    }
  }

  function schedule(operation) {
    if (typeof operation !== 'function') {
      return Promise.reject(new TypeError('Shamela rate limiter requires an operation'));
    }
    if (queuedRequests >= maxPendingRequests) {
      return Promise.reject(makeLimiterError(
        'SHAMELA_QUEUE_FULL',
        'د Shamela د پلټنو انتظار ډک دی؛ مهرباني وکړئ لږ وروسته بیا هڅه وکړئ.'
      ));
    }

    queuedRequests += 1;
    const pending = queue.then(async () => {
      await reservePermit();
      return operation();
    });
    queue = pending.catch(() => undefined);
    return pending.finally(() => {
      queuedRequests = Math.max(0, queuedRequests - 1);
    });
  }

  return {
    schedule,
    limits: Object.freeze({
      requestsPerMinute: maxRequestsPerMinute,
      requestsPerDay: maxRequestsPerDay,
      maxPendingRequests,
      storePath,
    }),
  };
}

module.exports = {
  createShamelaRateLimiter,
};
