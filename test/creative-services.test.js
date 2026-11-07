'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectCreativeRequest,
  isUnprefixedCreativeRequest,
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

test('detects simple Pashto writing requests only with the explicit prefix and keeps quoted topic context', () => {
  const request = detectCreativeRequest(
    'لیکنه: دا په ساده ژبه ولیکه؟',
    'د زړه دنده دا ده چې وینه ټول بدن ته پمپ کړي.'
  );
  assert.equal(request.kind, 'writing');
  assert.equal(request.style, 'simple');
  assert.match(request.topic, /د زړه دنده/);
});

test('detects academic article requests only with the explicit prefix and extracts an explicit topic', () => {
  const request = detectCreativeRequest('مقاله: د تعلیم په اړه علمي مقاله ولیکه؟');
  assert.equal(request.kind, 'article');
  assert.equal(request.style, 'academic');
  assert.equal(request.topic, 'تعلیم');
  const prompt = buildCreativePrompt(request);
  assert.match(prompt, /مقاله/);
  assert.match(prompt, /علمي/);
});

test('starts a book and recognizes chapter continuation from a quoted book context', () => {
  const first = detectCreativeRequest('کتاب: د پښتو ژبې په اړه کتاب پیل کړه؟');
  assert.equal(first.kind, 'book');
  assert.match(first.topic, /پښتو ژبې/);

  const next = detectCreativeRequest('کتاب: بل فصل ولیکه؟', 'د کتاب فهرست او لومړی فصل');
  assert.equal(next.kind, 'book');
  assert.equal(next.continuation, true);
  assert.match(buildCreativePrompt(next, 'د کتاب فهرست او لومړی فصل'), /راتلونکی فصل/);
});

test('uses quoted context as the image topic for reply-based image requests', () => {
  const request = detectCreativeRequest(
    'عکس: د همدې موضوع عکس جوړ کړه؟',
    'د پښتو الفبا د زده‌کړې لپاره د تورو او ماشومانو ښوونیزه موضوع'
  );
  assert.equal(request.kind, 'image');
  assert.match(buildImagePrompt(request), /پښتو الفبا/);
});

test('requires a trailing question mark for all four creative prefixes', () => {
  for (const command of [
    'لیکنه: د چاپېریال په اړه لیکنه ولیکه',
    'مقاله: د تعلیم په اړه مقاله ولیکه',
    'کتاب: د پښتو ژبې کتاب پیل کړه',
    'عکس: د افغانستان غرونه جوړ کړه',
  ]) {
    assert.equal(detectCreativeRequest(command), null, command);
  }

  assert.equal(detectCreativeRequest('لیکنه: د چاپېریال په اړه لیکنه ولیکه؟').kind, 'writing');
  assert.equal(detectCreativeRequest('مقاله: د تعلیم په اړه مقاله ولیکه?').kind, 'article');
  assert.equal(detectCreativeRequest('کتاب: د پښتو ژبې کتاب پیل کړه؟').kind, 'book');
  assert.equal(detectCreativeRequest('عکس: د افغانستان غرونه جوړ کړه؟').kind, 'image');
});

test('does not activate creative services for ordinary writing or image messages', () => {
  assert.equal(detectCreativeRequest('د چاپېریال په اړه مقاله ولیکه'), null);
  assert.equal(detectCreativeRequest('د افغانستان عکس جوړ کړه'), null);
  assert.equal(detectCreativeRequest('دا لیکنه سمه ده؟'), null);
  assert.equal(detectCreativeRequest('کتاب ولوله'), null);
});

test('identifies unprefixed creative commands so the answer engine can ignore them', () => {
  assert.equal(isUnprefixedCreativeRequest('د چاپېریال په اړه مقاله ولیکه'), true);
  assert.equal(isUnprefixedCreativeRequest('د افغانستان عکس جوړ کړه'), true);
  assert.equal(isUnprefixedCreativeRequest('عکس: د افغانستان غرونه'), false);
  assert.equal(isUnprefixedCreativeRequest('د چاپېریال ساتنه ولې مهمه ده؟'), false);
  assert.equal(isUnprefixedCreativeRequest('دا لیکنه سمه ده؟'), false);
});

test('asks for a topic when a creative prefix is sent without one', () => {
  assert.deepEqual(detectCreativeRequest('مقاله:؟'), { kind: 'missing_topic', command: 'مقاله' });
  assert.deepEqual(detectCreativeRequest('عکس:؟'), { kind: 'missing_topic', command: 'عکس' });
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

test('reports model metadata when OpenRouter succeeds without returning text', async () => {
  const generate = createOpenRouterCreativeGenerator({
    apiKey: 'test-key',
    model: 'openrouter/free',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        model: 'nvidia/nemotron-3-ultra:free',
        choices: [{ message: { content: '' }, finish_reason: 'length' }],
        usage: { completion_tokens: 2200 },
      }),
    }),
  });
  await assert.rejects(
    generate('یوه ساده لیکنه'),
    error => error.code === 'CREATIVE_EMPTY_RESPONSE' &&
      /nvidia\/nemotron-3-ultra:free/.test(error.message) &&
      /finish_reason=length/.test(error.message) &&
      /completion_tokens=2200/.test(error.message)
  );
});

test('extracts text segments when OpenRouter returns content as an array', async () => {
  const generate = createOpenRouterCreativeGenerator({
    apiKey: 'test-key',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: [{ type: 'text', text: 'دا ' }, { type: 'text', text: 'ازمویني متن دی.' }],
          },
        }],
      }),
    }),
  });
  assert.equal(await generate('یوه ساده لیکنه'), 'دا \nازمویني متن دی.');
});

test('classifies rejected OpenRouter API keys separately from rate limits', async () => {
  const generate = createOpenRouterCreativeGenerator({
    apiKey: 'test-key',
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' }),
  });
  await assert.rejects(generate('یوه لیکنه'), error => error.code === 'CREATIVE_PROVIDER_AUTH_ERROR');
});

test('fails safely when no OpenRouter key is configured', async () => {
  const generate = createOpenRouterCreativeGenerator({ apiKey: '' });
  await assert.rejects(generate('یوه لیکنه'), error => error.code === 'CREATIVE_AI_NOT_CONFIGURED');
});
