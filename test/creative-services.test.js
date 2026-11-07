'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectCreativeRequest,
  buildCreativePrompt,
  buildImagePrompt,
  getCreativeHelpReply,
  createOpenRouterCreativeGenerator,
} = require('../lib/creative-services');

test('shows the new service guide on common help commands', () => {
  assert.equal(detectCreativeRequest('خدمتونه').kind, 'help');
  assert.match(getCreativeHelpReply(), /مقاله/);
  assert.match(getCreativeHelpReply(), /کتاب/);
  assert.match(getCreativeHelpReply(), /عکس/);
});

test('detects simple Pashto writing requests and keeps quoted topic context', () => {
  const request = detectCreativeRequest(
    'دا په ساده ژبه ولیکه',
    'د زړه دنده دا ده چې وینه ټول بدن ته پمپ کړي.'
  );
  assert.equal(request.kind, 'writing');
  assert.equal(request.style, 'simple');
  assert.match(request.topic, /د زړه دنده/);
});

test('detects academic article requests and extracts an explicit topic', () => {
  const request = detectCreativeRequest('د تعلیم په ارزښت علمي مقاله ولیکه');
  assert.equal(request.kind, 'article');
  assert.equal(request.style, 'academic');
  assert.equal(request.topic, 'تعلیم');
  const prompt = buildCreativePrompt(request);
  assert.match(prompt, /مقاله/);
  assert.match(prompt, /علمي/);
});

test('starts a book and recognizes chapter continuation from a quoted book context', () => {
  const first = detectCreativeRequest('د پښتو ژبې په اړه کتاب پیل کړه');
  assert.equal(first.kind, 'book');
  assert.match(first.topic, /پښتو ژبې/);

  const next = detectCreativeRequest('بل فصل ولیکه', 'د کتاب فهرست او لومړی فصل');
  assert.equal(next.kind, 'book');
  assert.equal(next.continuation, true);
  assert.match(buildCreativePrompt(next, 'د کتاب فهرست او لومړی فصل'), /راتلونکی فصل/);
});

test('uses quoted context as the image topic for reply-based image requests', () => {
  const request = detectCreativeRequest(
    'د همدې موضوع عکس جوړ کړه',
    'د پښتو الفبا د زده‌کړې لپاره د تورو او ماشومانو ښوونیزه موضوع'
  );
  assert.equal(request.kind, 'image');
  assert.match(buildImagePrompt(request), /پښتو الفبا/);
});

test('calls the configured OpenRouter free model and returns its generated text', async () => {
  let requestBody;
  const generate = createOpenRouterCreativeGenerator({
    apiKey: 'test-key',
    model: 'openrouter/free',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'دا ازمویني لیکنه ده.' } }] }),
      };
    },
  });
  const result = await generate('یوه ساده لیکنه ولیکه');
  assert.equal(result, 'دا ازمویني لیکنه ده.');
  assert.equal(requestBody.model, 'openrouter/free');
  assert.equal(requestBody.max_tokens, 2200);
});

test('fails safely when no OpenRouter key is configured', async () => {
  const generate = createOpenRouterCreativeGenerator({ apiKey: '' });
  await assert.rejects(generate('یوه لیکنه'), error => error.code === 'CREATIVE_AI_NOT_CONFIGURED');
});
