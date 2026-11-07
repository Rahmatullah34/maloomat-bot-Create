# Maloomat AI — Free Creative Services

The bot supports these Pashto requests in both allowed group chats and the owner's private chat:

## Text services

- General information: **د افغانستان په اړه معلومات راکړه**
- Simple writing: **د چاپېریال په اړه ساده لیکنه ولیکه**
- Academic article: **د تعلیم په اړه علمي مقاله ولیکه**
- Start a book: **د پښتو ژبې په اړه کتاب پیل کړه**
- Continue a book: reply to the latest chapter and write **بل فصل ولیکه**
- Service guide: write **خدمتونه**

When referring to an earlier answer, use WhatsApp Reply. The bot keeps the original subject and up to five follow-up turns, isolated by chat and sender.

Text creation uses the existing OPENROUTER_API_KEY with OPENROUTER_CREATIVE_MODEL, defaulting to openrouter/free. The bot limits creative requests to 30 attempts per running process/day to preserve quota. OpenRouter's free-model allowance is rate-limited (currently 50 requests/day and 20 requests/minute for free variants); provider-side limits still apply. The local counter resets when the process restarts, but the provider quota does not. See https://openrouter.ai/collections/free-models and https://openrouter.ai/pricing.

## Image generation

Example: **د همدې موضوع عکس جوړ کړه**

Image generation uses Cloudflare Workers AI with @cf/black-forest-labs/flux-1-schnell. It is optional and stays disabled until both Cloudflare values are present in the hosting environment:

- CLOUDFLARE_ACCOUNT_ID: the Cloudflare account ID.
- CLOUDFLARE_API_TOKEN: a secret API token with the minimum Workers AI permission needed to run a model (Workers AI Write is recommended).

Optional override: CLOUDFLARE_IMAGE_MODEL (defaults to @cf/black-forest-labs/flux-1-schnell).

Add these as private environment variables/secrets in SillyDev. Do not put the API token in GitHub, source code, WhatsApp groups, or this chat. Restart/redeploy after setting them. The /health response will show whether image generation is configured; it never returns the token.

The bot caps image requests at 50 per running process/day and two per sender/chat/day. Cloudflare currently includes 10,000 Workers AI Neurons per day at no charge on the Free plan; the bot's local cap is deliberately lower, and Cloudflare's own quota/rate limits remain authoritative. The local counters reset if the process restarts. See https://developers.cloudflare.com/workers-ai/platform/pricing/ and https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/.

AI-generated text and images are not unlimited. If a free-tier quota or provider rate limit is reached, the bot asks the user to try again after the quota resets. Pashto lettering inside generated images may not render correctly; for clean educational images, request an illustration without embedded text.