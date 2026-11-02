'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isImageMessage,
  createImageQuestionExtractor,
} = require('../lib/image-question');

test('recognizes normal, wrapped, and image-document WhatsApp messages', () => {
  assert.equal(isImageMessage({ imageMessage: { mimetype: 'image/jpeg' } }), true);
  assert.equal(isImageMessage({
    viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/jpeg' } } },
  }), true);
  assert.equal(isImageMessage({ documentMessage: { mimetype: 'image/jpeg', fileName: 'photo.jpg' } }), true);\n  assert.equal(isImageMessage({ documentMessage: { mimetype: 'application/octet-stream', fileName: 'worksheet.png' } }), true);\n  assert.equal(isImageMessage({ documentMessage: { mimetype: 'application/pdf', fileName: 'worksheet.pdf' } }), false);\n  assert.equal(isImageMessage({ conversation: 'دا یوازې متن دی' }), false);
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

test('does not route the image caption as a normal question when no question is visible', async () => {
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


test('downloads image documents and sends them to the vision model', async () => {
  let downloadedMessage;
  const photoDocument = {
    key: { remoteJid: '12345@g.us' },
    message: {
      documentMessage: {
        mimetype: 'application/octet-stream',
        fileName: 'worksheet.jpg',
      },
    },
  };
  const extract = createImageQuestionExtractor({
    downloadMediaMessage: async (message) => {
      downloadedMessage = message;
      return Buffer.from('fake-jpeg-bytes');
    },
    readOpenRouterApiKey: () => 'test-key',
    fetchImpl: async (_url, options) => {
      const payload = JSON.parse(options.body);
      assert.match(payload.messages[0].content[1].image_url.url, /^data:image\\/jpeg;base64,/);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'دا د انځور پوښتنه ده؟' } }],
        }),
      };
    },
  });

  assert.equal(
    await extract(photoDocument, {}, 'دا وګوره'),
    'دا وګوره\\n\\n📷 د انځور پوښتنه:\\nدا د انځور پوښتنه ده؟'
  );
  assert.equal(downloadedMessage, photoDocument);
});
