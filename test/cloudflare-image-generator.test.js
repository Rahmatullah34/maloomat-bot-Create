'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCloudflareImageGenerator } = require('../lib/cloudflare-image-generator');

test('calls the Cloudflare FLUX model and returns the generated image buffer', async () => {
  let calledUrl = '';
  let calledBody = null;
  const generate = createCloudflareImageGenerator({
    accountId: 'account-id',
    apiToken: 'secret-token',
    fetchImpl: async (url, options) => {
      calledUrl = url;
      calledBody = JSON.parse(options.body);
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ result: { image: Buffer.from('test-image').toString('base64') } }),
      };
    },
  });

  const result = await generate('A school library illustration', 'group|sender');
  assert.ok(calledUrl.includes('/ai/run/@cf/black-forest-labs/flux-1-schnell'));
  assert.equal(calledBody.prompt, 'A school library illustration');
  assert.equal(calledBody.steps, 4);
  assert.equal(result.buffer.toString(), 'test-image');
  assert.equal(result.mimeType, 'image/jpeg');
});

test('refuses to call the image provider when Cloudflare credentials are missing', async () => {
  const generate = createCloudflareImageGenerator();
  await assert.rejects(
    generate('A Pashto alphabet illustration'),
    error => error.code === 'IMAGE_PROVIDER_NOT_CONFIGURED'
  );
});

test('limits each sender to two free image requests per UTC day', async () => {
  let calls = 0;
  const generate = createCloudflareImageGenerator({
    accountId: 'account-id',
    apiToken: 'secret-token',
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ result: { image: Buffer.from('img').toString('base64') } }),
      };
    },
  });

  await generate('first prompt', 'sender-1');
  await generate('second prompt', 'sender-1');
  await assert.rejects(
    generate('third prompt', 'sender-1'),
    error => error.code === 'IMAGE_DAILY_LIMIT'
  );
  assert.equal(calls, 2);
});
