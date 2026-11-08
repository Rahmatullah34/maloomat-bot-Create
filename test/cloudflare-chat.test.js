'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createCloudflareAIClient,
  createCloudflareCreativeGenerator,
} = require('../lib/cloudflare-chat');

function makeResponse(status, data) {
  const raw = typeof data === 'string' ? data : JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => raw,
  };
}

test('calls the Cloudflare Workers AI chat-completions endpoint with the selected model', async () => {
  let request;
  const client = createCloudflareAIClient({
    accountId: 'test-account',
    apiToken: 'test-token',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return makeResponse(200, {
        model: '@cf/zai-org/glm-4.7-flash',
        choices: [{ message: { content: 'دا د Cloudflare ازمویني ځواب دی.' }, finish_reason: 'stop' }],
      });
    },
  });

  const data = await client.chatCompletion({
    model: '@cf/zai-org/glm-4.7-flash',
    messages: [{ role: 'user', content: 'سلام' }],
    maxTokens: 800,
  });

  assert.match(request.url, /\/accounts\/test-account\/ai\/v1\/chat\/completions$/);
  assert.equal(request.options.headers.Authorization, 'Bearer test-token');
  assert.equal(request.body.model, '@cf/zai-org/glm-4.7-flash');
  assert.equal(request.body.max_completion_tokens, 800);
  assert.equal(request.body.max_tokens, undefined);
  assert.equal(data.choices[0].message.content, 'دا د Cloudflare ازمویني ځواب دی.');
});

test('generates a Pashto creative response through Cloudflare Workers AI', async () => {
  let body;
  const generate = createCloudflareCreativeGenerator({
    accountId: 'test-account',
    apiToken: 'test-token',
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return makeResponse(200, {
        model: '@cf/zai-org/glm-4.7-flash',
        choices: [{ message: { content: 'دا د چاپېریال په اړه ازمویني لیکنه ده.' }, finish_reason: 'stop' }],
      });
    },
  });

  const answer = await generate('د چاپېریال په اړه یوه لیکنه ولیکه');
  assert.match(answer, /چاپېریال/);
  assert.equal(body.model, '@cf/zai-org/glm-4.7-flash');
  assert.equal(body.messages[1].content, 'د چاپېریال په اړه یوه لیکنه ولیکه');
});

test('reports missing Cloudflare account credentials without attempting a network request', async () => {
  let called = false;
  const client = createCloudflareAIClient({
    fetchImpl: async () => { called = true; throw new Error('should not call'); },
  });

  await assert.rejects(
    client.chatCompletion({ messages: [{ role: 'user', content: 'سلام' }] }),
    error => error.code === 'CLOUDFLARE_AI_NOT_CONFIGURED'
  );
  assert.equal(called, false);
});

test('classifies invalid Workers AI tokens and rate limits', async () => {
  const invalidTokenClient = createCloudflareAIClient({
    accountId: 'test-account',
    apiToken: 'test-token',
    fetchImpl: async () => makeResponse(403, { errors: [{ message: 'Forbidden' }] }),
  });
  const rateLimitedClient = createCloudflareAIClient({
    accountId: 'test-account',
    apiToken: 'test-token',
    fetchImpl: async () => makeResponse(429, { errors: [{ message: 'Too many requests' }] }),
  });

  await assert.rejects(
    invalidTokenClient.chatCompletion({ messages: [{ role: 'user', content: 'سلام' }] }),
    error => error.code === 'CLOUDFLARE_AI_AUTH_ERROR'
  );
  await assert.rejects(
    rateLimitedClient.chatCompletion({ messages: [{ role: 'user', content: 'سلام' }] }),
    error => error.code === 'CLOUDFLARE_AI_RATE_LIMIT'
  );
});

test('classifies Cloudflare request timeouts with a stable error code', async () => {
  const client = createCloudflareAIClient({
    accountId: 'test-account',
    apiToken: 'test-token',
    fetchImpl: async () => {
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      throw error;
    },
  });

  await assert.rejects(
    client.chatCompletion({ messages: [{ role: 'user', content: 'سلام' }] }),
    error => error.code === 'CLOUDFLARE_AI_TIMEOUT' && /timed out/.test(error.message)
  );
});

test('reports model metadata when Cloudflare returns an empty completion', async () => {
  const generate = createCloudflareCreativeGenerator({
    accountId: 'test-account',
    apiToken: 'test-token',
    fetchImpl: async () => makeResponse(200, {
      model: '@cf/zai-org/glm-4.7-flash',
      choices: [{ message: { content: '' }, finish_reason: 'length' }],
    }),
  });

  await assert.rejects(
    generate('یوه لیکنه'),
    error => error.code === 'CLOUDFLARE_AI_EMPTY_RESPONSE' &&
      /glm-4.7-flash/.test(error.message) &&
      /finish_reason=length/.test(error.message)
  );
});
