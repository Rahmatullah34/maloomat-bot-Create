'use strict';

function extractCloudflareMessageText(choice) {
  const content = choice?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part === 'string' ? part : String(part?.text || ''))
      .join('\n')
      .trim();
  }
  return '';
}

function createCloudflareAIClient(dependencies = {}) {
  const {
    accountId = '',
    apiToken = '',
    fetchImpl = globalThis.fetch,
  } = dependencies;

  async function chatCompletion(options = {}) {
    const account = String(accountId || '').trim();
    const token = String(apiToken || '').trim();
    if (!account || !token) {
      const error = new Error('Cloudflare Workers AI requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN');
      error.code = 'CLOUDFLARE_AI_NOT_CONFIGURED';
      throw error;
    }
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch is unavailable');

    const model = String(options.model || '@cf/zai-org/glm-4.7-flash').trim();
    const messages = Array.isArray(options.messages) ? options.messages : [];
    if (!model || !messages.length) throw new TypeError('Cloudflare AI model and messages are required');

    const timeoutMs = Math.min(60000, Math.max(5000, Number(options.timeoutMs) || 30000));
    let response;
    try {
      response = await fetchImpl(
        'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(account) + '/ai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.2,
            max_tokens: Math.min(4000, Math.max(200, Number(options.maxTokens) || 1600)),
          }),
          signal: AbortSignal.timeout(timeoutMs),
        }
      );
    } catch (cause) {
      const message = String(cause?.message || cause || '');
      if (
        cause?.name === 'TimeoutError' ||
        cause?.name === 'AbortError' ||
        /timeout|aborted/i.test(message)
      ) {
        const error = new Error('Cloudflare Workers AI request timed out after ' + timeoutMs + 'ms');
        error.code = 'CLOUDFLARE_AI_TIMEOUT';
        error.cause = cause;
        throw error;
      }
      throw cause;
    }

    const raw = await response.text().catch(() => '');
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      const error = new Error(
        'Cloudflare Workers AI failed with HTTP ' + response.status + ': ' + raw.slice(0, 220)
      );
      error.code = response.status === 429
        ? 'CLOUDFLARE_AI_RATE_LIMIT'
        : response.status === 401 || response.status === 403
          ? 'CLOUDFLARE_AI_AUTH_ERROR'
          : response.status === 402
            ? 'CLOUDFLARE_AI_ACCOUNT_ERROR'
            : 'CLOUDFLARE_AI_PROVIDER_ERROR';
      error.status = response.status;
      throw error;
    }

    if (data?.error) {
      const detail = typeof data.error === 'string'
        ? data.error
        : String(data.error.message || data.error.code || 'unknown API error');
      const error = new Error('Cloudflare Workers AI returned an API error: ' + detail.slice(0, 220));
      error.code = 'CLOUDFLARE_AI_PROVIDER_ERROR';
      throw error;
    }

    return data;
  }

  return { chatCompletion };
}

function createCloudflareCreativeGenerator(dependencies = {}) {
  const {
    accountId = '',
    apiToken = '',
    model = '@cf/zai-org/glm-4.7-flash',
    fetchImpl = globalThis.fetch,
    dailyLimit = 30,
    maxTokens = 2200,
  } = dependencies;

  const client = createCloudflareAIClient({ accountId, apiToken, fetchImpl });
  let usageDate = '';
  let usageCount = 0;

  return async function generateCreativeText(prompt) {
    const text = String(prompt || '').trim().slice(0, 9000);
    if (!text) throw new TypeError('Creative prompt is empty');

    const today = new Date().toISOString().slice(0, 10);
    if (usageDate !== today) {
      usageDate = today;
      usageCount = 0;
    }
    if (usageCount >= dailyLimit) {
      const error = new Error('Daily free text generation limit reached');
      error.code = 'CREATIVE_DAILY_LIMIT';
      throw error;
    }
    usageCount += 1;

    const data = await client.chatCompletion({
      model,
      maxTokens,
      temperature: 0.2,
      timeoutMs: 55000,
      messages: [
        {
          role: 'system',
          content: 'ته د پښتو ژبې مسلکي او کره لیکوال یې. یوازې طبیعي، روانه او له ګرامري پلوه سمه پښتو وکاروه. له مصنوعي ژباړې، بې‌مانا کلمو، ناسمې جملې، تکرار او بې‌اړخه مقدمې ډډه وکړه. د ځواب تر لېږلو مخکې املاء او هره جمله بیا وارزوه. جعلي سرچینې، ادارې، کتابونه، اقتباسونه، شمېرې او حوالې هېڅکله مه جوړوه. که سرچینه په پیغام کې نه وي درکړل شوې او ته یې نه شې تاییدولای، د سرچینې نوم مه یادوه او د تایید نشتوالی واضح کړه. یوازې د کارونکي غوښتل شوی متن ولیکه؛ د Profile Picture یا نورو بې‌اړخه برخو یادونه مه کوه.',
        },
        { role: 'user', content: text },
      ],
    });

    const choice = data?.choices?.[0] || {};
    const answer = extractCloudflareMessageText(choice);
    if (!answer) {
      const finishReason = String(choice.finish_reason || 'unknown').slice(0, 40);
      const error = new Error(
        'Cloudflare Workers AI returned no textual creative answer (model=' +
        String(data?.model || model).slice(0, 100) +
        ', finish_reason=' + finishReason +
        ', choices=' + (Array.isArray(data?.choices) ? data.choices.length : 0) + ')'
      );
      error.code = 'CLOUDFLARE_AI_EMPTY_RESPONSE';
      throw error;
    }
    return answer.slice(0, 12000);
  };
}

module.exports = {
  extractCloudflareMessageText,
  createCloudflareAIClient,
  createCloudflareCreativeGenerator,
};
