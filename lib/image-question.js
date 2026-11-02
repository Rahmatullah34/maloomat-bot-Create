'use strict';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function unwrapMessageContent(message) {
  let content = message?.message || message;
  for (let index = 0; index < 8 && content; index += 1) {
    const wrapped =
      content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.viewOnceMessageV2Extension?.message ||
      content.documentWithCaptionMessage?.message;
    if (!wrapped) break;
    content = wrapped;
  }
  return content;
}

function isImageMessage(message) {
  return Boolean(unwrapMessageContent(message)?.imageMessage);
}

function getAssistantText(message) {
  const content = message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part?.text === 'string' ? part.text : '')
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

function createImageQuestionExtractor(dependencies = {}) {
  const {
    downloadMediaMessage,
    readOpenRouterApiKey,
    visionModel = 'openrouter/free',
    logger,
    fetchImpl = globalThis.fetch,
  } = dependencies;

  return async function extractQuestionFromImage(message, socket, caption = '') {
    const userCaption = String(caption || '').trim();
    const imageNode = unwrapMessageContent(message)?.imageMessage;
    if (!imageNode) return userCaption;

    try {
      if (typeof downloadMediaMessage !== 'function') {
        throw new Error('د WhatsApp د عکس ښکته کولو وسیله نه ده برابره شوې');
      }
      const apiKey = typeof readOpenRouterApiKey === 'function'
        ? String(readOpenRouterApiKey() || '').trim()
        : '';
      if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY تنظیم نه دی');
      }
      if (typeof fetchImpl !== 'function') {
        throw new Error('د HTTP غوښتنې وسیله موجوده نه ده');
      }

      const mimeType = String(imageNode.mimetype || 'image/jpeg')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
        throw new Error('د عکس بڼه نه ده ملاتړ شوې: ' + mimeType);
      }

      const media = await downloadMediaMessage(
        message,
        'buffer',
        {},
        {
          logger,
          reuploadRequest: typeof socket?.updateMediaMessage === 'function'
            ? socket.updateMediaMessage
            : undefined,
        }
      );
      const imageBuffer = Buffer.isBuffer(media) ? media : Buffer.from(media || []);
      if (!imageBuffer.length) throw new Error('د عکس فایل تش دی');
      if (imageBuffer.length > MAX_IMAGE_BYTES) {
        throw new Error('د عکس اندازه له ۸ MB لوړه ده');
      }

      const dataUrl = 'data:' + mimeType + ';base64,' + imageBuffer.toString('base64');
      const prompt = [
        'Read the attached WhatsApp image carefully.',
        'Extract the visible question, school exercise, calculation, or task that the sender expects the bot to answer.',
        'Transcribe it faithfully in the original language and script. Preserve names, numbers, formulas, and line order.',
        'Do not answer, translate, summarize, greet, or describe the picture.',
        'If a clear question or exercise has no final question mark, add a final Pashto question mark (؟) so the question-answer system can recognize it.',
        'If there is no clearly readable question or task, return exactly NO_QUESTION.',
        'Return only the extracted question/task text, with no heading or explanation.',
        userCaption ? 'Sender caption/instruction: ' + userCaption.slice(0, 900) : '',
      ].filter(Boolean).join('\n');

      const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'X-Title': 'Maloomat AI - Image Question Reader',
        },
        body: JSON.stringify({
          model: String(visionModel || 'openrouter/free'),
          temperature: 0,
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          }],
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error('OpenRouter د عکس لوستلو غوښتنه رد کړه؛ HTTP ' +
          response.status + '؛ ' + detail.slice(0, 180));
      }

      const data = await response.json();
      const extracted = getAssistantText(data?.choices?.[0]?.message)
        .replace(/^\`\`\`[^\n]*\n?/u, '')
        .replace(/\n?\`\`\`$/u, '')
        .trim();

      if (!extracted || /^NO_QUESTION$/iu.test(extracted)) return userCaption;
      const questionText = extracted.slice(0, 650);
      return userCaption
        ? userCaption + '\n\n📷 د انځور پوښتنه:\n' + questionText
        : questionText;
    } catch (error) {
      console.warn('⚠️ د WhatsApp عکس لوستل ناکام شول:', error?.message || error);
      return userCaption;
    }
  };
}

module.exports = {
  MAX_IMAGE_BYTES,
  isImageMessage,
  createImageQuestionExtractor,
};
