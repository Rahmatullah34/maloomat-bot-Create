'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isImageMessage,
  createImageQuestionExtractor,
} = require('../lib/image-question');

test('recognizes normal and wrapped WhatsApp image messages', () => {
  assert.equal(isImageMessage({ imageMessage: { mimetype: 'image/jpeg' } }), true);
  assert.equal(isImageMessage({
    viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/jpeg' } } },
  }), true);
  assert.equal(isImageMessage({ conversation: 'دا یوازې متن دی' }), false);
});

test('does not call media or OpenRouter services for ordinary text', async () => {
  let downloadCalls = 0;
  const extract = createImageQuestionExtractor({
    downloadMediaMessage: async () => { downloadCalls += 1; },
    readOpenRouterApiKey: () => 'test-key',
    fetchImpl: async () => { throw new Error('fetch should not run'); },
  });
  assert.equal(await extract({ message: { conversation: 'پوښتنه؟' } }, {}, 'پوښتنه؟'), 'پوښتنه؟');
  assert.equal(downloadCalls, 0);
});

test('downloads an image, sends a multimodal OpenRouter request, and returns the recognized question', async () => {
  let requestPayload;
  let downloadOptions;
  const image = {
    key: { remoteJid: '12345@g.us' },
    message: { viewOnceMessage: { message: { imageMessage: { mimetype: 'image/jpeg' } } } },
  };
  const extract = createImageQuestionExtractor({
    downloadMediaMessage: async (_message, mode, _options, baileysOptions) => {
      assert.equal(mode, 'buffer');
      downloadOptions = baileysOptions;
      return Buffer.from('fake-jpeg-bytes');
    },
    readOpenRouterApiKey: () => 'test-key',
    visionModel: 'openrouter/free',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
      requestPayload = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'د زړه دنده څه ده؟' } }],
        }),
      };
    },
  });

  const question = await extract(image, { updateMediaMessage() {} }, '');
  assert.equal(question, 'د زړه دنده څه ده؟');
  assert.equal(requestPayload.model, 'openrouter/free');
  assert.equal(requestPayload.messages[0].content[0].type, 'text');
  assert.equal(requestPayload.messages[0].content[1].type, 'image_url');
  assert.match(requestPayload.messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,/);
  assert.equal(typeof downloadOptions.reuploadRequest, 'function');
});

test('keeps the sender caption when no question is visible in the image', async () => {
  const extract = createImageQuestionExtractor({
    downloadMediaMessage: async () => Buffer.from('fake-image'),
    readOpenRouterApiKey: () => 'test-key',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'NO_QUESTION' } }] }),
    }),
  });
  assert.equal(
    await extract({ message: { imageMessage: { mimetype: 'image/png' } } }, {}, 'دا وګوره'),
    'دا وګوره'
  );
});
