'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createShamelaRateLimiter } = require('../lib/shamela-rate-limiter');

function temporaryStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maloomat-shamela-limit-'));
  return {
    path: path.join(directory, 'rate-limit.json'),
    cleanup() {
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

test('applies one shared sliding-minute limit to queued Shamela calls', async () => {
  const store = temporaryStore();
  let clock = Date.UTC(2026, 10, 6, 12, 0, 0);
  const executionTimes = [];
  const waits = [];
  const limiter = createShamelaRateLimiter({
    storePath: store.path,
    maxRequestsPerMinute: 2,
    maxRequestsPerDay: 10,
    now: () => clock,
    sleep: async milliseconds => {
      waits.push(milliseconds);
      clock += milliseconds;
    },
  });

  try {
    await Promise.all([1, 2, 3].map(() => limiter.schedule(async () => {
      executionTimes.push(clock);
    })));

    assert.equal(executionTimes.length, 3);
    assert.ok(executionTimes[2] - executionTimes[0] >= 60000);
    assert.ok(waits.length >= 1);
    const saved = JSON.parse(fs.readFileSync(store.path, 'utf8'));
    assert.equal(saved.dailyRequests, 3);
  } finally {
    store.cleanup();
  }
});

test('persists minute and daily usage across limiter instances and restarts', async () => {
  const store = temporaryStore();
  let clock = Date.UTC(2026, 10, 6, 12, 0, 0);
  const executionTimes = [];
  const options = {
    storePath: store.path,
    maxRequestsPerMinute: 1,
    maxRequestsPerDay: 4,
    now: () => clock,
    sleep: async milliseconds => {
      clock += milliseconds;
    },
  };

  try {
    const firstProcess = createShamelaRateLimiter(options);
    await firstProcess.schedule(async () => executionTimes.push(clock));

    const restartedProcess = createShamelaRateLimiter(options);
    await restartedProcess.schedule(async () => executionTimes.push(clock));
    assert.ok(executionTimes[1] - executionTimes[0] >= 60000);

    const saved = JSON.parse(fs.readFileSync(store.path, 'utf8'));
    assert.equal(saved.dailyRequests, 2);
  } finally {
    store.cleanup();
  }
});

test('stops at the conservative daily cap and resets only on the next UTC day', async () => {
  const store = temporaryStore();
  let clock = Date.UTC(2026, 10, 6, 12, 0, 0);
  const options = {
    storePath: store.path,
    maxRequestsPerMinute: 9,
    maxRequestsPerDay: 2,
    now: () => clock,
    sleep: async milliseconds => {
      clock += milliseconds;
    },
  };

  try {
    const limiter = createShamelaRateLimiter(options);
    await limiter.schedule(async () => 'first');
    await limiter.schedule(async () => 'second');
    await assert.rejects(
      limiter.schedule(async () => 'blocked'),
      error => error.code === 'SHAMELA_DAILY_LIMIT',
    );

    clock += 24 * 60 * 60 * 1000;
    const nextDayLimiter = createShamelaRateLimiter(options);
    await nextDayLimiter.schedule(async () => 'next day');
    const saved = JSON.parse(fs.readFileSync(store.path, 'utf8'));
    assert.equal(saved.dailyRequests, 1);
    assert.equal(saved.day, new Date(clock).toISOString().slice(0, 10));
  } finally {
    store.cleanup();
  }
});

test('fails closed when the persisted usage record is corrupt', async () => {
  const store = temporaryStore();
  fs.writeFileSync(store.path, '{not-json', 'utf8');

  try {
    const limiter = createShamelaRateLimiter({
      storePath: store.path,
      now: () => Date.UTC(2026, 10, 6, 12, 0, 0),
      sleep: async () => {},
    });
    await assert.rejects(
      limiter.schedule(async () => 'must not run'),
      error => error.code === 'SHAMELA_RATE_STATE_UNREADABLE',
    );
  } finally {
    store.cleanup();
  }
});
