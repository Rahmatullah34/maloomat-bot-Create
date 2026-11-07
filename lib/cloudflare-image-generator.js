'use strict';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MODEL = '@cf/black-forest-labs/flux-1-schnell';

function createCloudflareImageGenerator(dependencies = {}) {
  const {
    accountId = '',
    apiToken = '',
    model = DEFAULT_MODEL,
    fetchImpl = globalThis.fetch,
    dailyLimit = 50,
  } = dependencies;

  const usage = { date: '', count: 0, perSender: new Map() };

  return async function generateImage(prompt, senderKey = 'unknown') {
    const account = String(accountId || '').trim();
    const token = String(apiToken || '').trim();
    const description = String(prompt || '').trim().slice(0, 2048);
    if (!account || !token) {
      const error = new Error('Cloudflare image credentials are not configured');
      error.code = 'IMAGE_PROVIDER_NOT_CONFIGURED';
      throw error;
    }
    if (!description) {
      const error = new Error('Image prompt is empty');
      error.code = 'IMAGE_PROMPT_EMPTY';
      throw error;
    }
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch is unavailable');

    const today = new Date().toISOString().slice(0, 10);
    if (usage.date !== today) {
      usage.date = today;
      usage.count = 0;
      usage.perSender.clear();
    }
    const sender = String(senderKey || 'unknown').slice(0, 160);
    if (usage.count >= dailyLimit || (usage.perSender.get(sender) || 0) >= 5) {
      const error = new Error('Daily free image generation limit reached');
      error.code = 'IMAGE_DAILY_LIMIT';
      throw error;
    }

    // Count attempts, not just successes, so retries cannot burn through the free quota.
    usage.count += 1;
    usage.perSender.set(sender, (usage.perSender.get(sender) || 0) + 1);

    const modelPath = String(model || DEFAULT_MODEL)
      .split('/')
      .map(part => encodeURIComponent(part).replace(/%40/giu, '@'))
      .join('/');
    const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' +
      encodeURIComponent(account) + '/ai/run/' + modelPath;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: description, steps: 4 }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const error = new Error('Cloudflare image API failed with HTTP ' + response.status + ': ' + detail.slice(0, 180));
      error.code = response.status === 429 ? 'IMAGE_PROVIDER_RATE_LIMIT' : 'IMAGE_PROVIDER_ERROR';
      throw error;
    }

    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    let buffer;
    let mimeType = 'image/jpeg';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      const base64 = String(data?.result?.image || data?.image || '').trim();
      if (!base64) throw new Error('Cloudflare returned no image data');
      buffer = Buffer.from(base64, 'base64');
    } else {
      const bytes = await response.arrayBuffer();
      buffer = Buffer.from(bytes);
      if (contentType.startsWith('image/')) mimeType = contentType.split(';')[0];
    }

    if (!buffer?.length) throw new Error('Generated image is empty');
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Generated image exceeds WhatsApp size limit');
    return { buffer, mimeType, model: String(model || DEFAULT_MODEL) };
  };
}

module.exports = {
  MAX_IMAGE_BYTES,
  DEFAULT_MODEL,
  createCloudflareImageGenerator,
};
