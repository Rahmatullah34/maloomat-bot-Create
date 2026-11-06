'use strict';

const SHAMELA_MCP_ENDPOINT = 'https://qurangallery.com/mcp/shamela';
const DEFAULT_LIMIT = 3;
const MAX_PAGE_READS = 2;
const PASHTO_SPECIFIC_LETTERS = /[پچژړڅځږښګټډڼېۍۀی]/u;
const HAS_ARABIC_SCRIPT = /[\u0600-\u06FF]/u;

const QUERY_FALLBACKS = [
  [/ږیر|ګیر|beard|shav/iu, 'حكم حلق اللحية وإعفاء اللحية'],
  [/سلام|هجر|فاسق|ګناهکار|بدعمل/iu, 'حكم ابتداء السلام على الفاسق وهجر أهل المعاصي'],
  [/سود|ربا|وعده|تورق|قرض|پور|نسیه|قسط|loan|interest/iu, 'أحكام الربا والقرض والتورق وبيع التقسيط'],
  [/لمونځ|نماز|سجده|رکعت|prayer|salah/iu, 'أحكام الصلاة وشروطها وأركانها'],
  [/اودس|(?<![\p{L}\p{N}])وضو(?![\p{L}\p{N}])|غسل|تیمم|wudu|ablution/iu, 'أحكام الوضوء والغسل والتيمم'],
  [/روژه|رمضان|روژې|fast/iu, 'أحكام الصيام وشهر رمضان'],
  [/زکات|زکاة|نصاب|zak/iu, 'أحكام الزكاة والنصاب'],
  [/حج|عمره|hajj|umrah/iu, 'أحكام الحج والعمرة'],
  [/طلاق|نکاح|واده|ښځه|مېړه|divorce|marriage/iu, 'أحكام النكاح والطلاق والأسرة'],
  [/میراث|وراثت|ارث|inheritance/iu, 'أحكام المواريث والفرائض'],
  [/حدیث|حديث|روایت|سند|صحیح|ضعیف|hadith/iu, 'شرح الحديث وتخريج الحديث وأسانيده'],
  [/قرآن|قران|تفسیر|سورت|آیت|آیه|quran|tafsir/iu, 'تفسير القرآن الكريم وعلوم القرآن'],
  [/ایمان|عقیده|عقیده|توحید|شرک|عقيدة|aqeedah/iu, 'أصول العقيدة والتوحيد والإيمان'],
  [/پیغمبر|رسول|سیرت|محمد|seerah|prophet/iu, 'السيرة النبوية وتاريخ رسول الله'],
  [/اسلام|اسلامي|مسلمان|دین|مذهب|islam|muslim/iu, 'تعريف الإسلام وأركان الإسلام وأصول الدين'],
  [/حلال|حرام|شرعي حکم|فقه|حکم|fiqh|halal|haram/iu, 'الأحكام الشرعية والمسائل الفقهية وأدلتها'],
  [/صدقه|صدقه|خیرات|انفاق|صدقة|charity/iu, 'أحكام الصدقة والإنفاق في الإسلام'],
];

function chooseShamelaScope(question) {
  const value = String(question || '').normalize('NFKC').toLowerCase();
  if (/(?:حدیث|حديث|hadith|سند|تخریج|تخريج|راوي|راوي|رواة|رجال الحديث)/iu.test(value)) {
    return /(?:سند|تخریج|تخريج|درجه|صحت|ضعیف|ضعيف|صحیح|صحيح)/iu.test(value)
      ? 'hadith-sciences'
      : 'hadith-primary';
  }
  if (/(?:قرآن|قران|تفسیر|تفسير|آیت|آیه|سورت|quran|tafsir)/iu.test(value)) {
    return 'tafsir-canonical';
  }
  if (/(?:حنفي|حنفی|حنفیه|حنفية|hanafi)/iu.test(value)) return 'fiqh-hanafi';
  if (/(?:مالکي|مالکی|مالكية|maliki)/iu.test(value)) return 'fiqh-maliki';
  if (/(?:شافعي|شافعی|شافعية|shafii|shafi'i)/iu.test(value)) return 'fiqh-shafii';
  if (/(?:حنبلي|حنبلی|حنبلية|hanbali)/iu.test(value)) return 'fiqh-hanbali';
  if (/(?:عقید(?:ه|ې)|عقيدة|عقيده|توحید|توحيد|ایمان|کلام|aqeedah|creed)/iu.test(value)) return 'aqeedah';
  if (/(?:سیرت|سيرة|پیغمبر|رسول الله|محمد ﷺ|prophet|seerah)/iu.test(value)) return 'seerah';
  if (/(?:صرف|نحو|لغت|اعراب|بلاغت|عربي ژبه|grammar|lexicon)/iu.test(value)) return 'lugha';
  return 'fiqh-comparative';
}

function fallbackArabicSearchQuery(question) {
  const value = String(question || '');
  const match = QUERY_FALLBACKS.find(([pattern]) => pattern.test(value));
  return match ? match[1] : '';
}

function parseToolPayload(envelope) {
  if (envelope?.error) {
    throw new Error(String(envelope.error.message || 'MCP JSON-RPC error'));
  }
  const result = envelope?.result;
  if (result?.isError) {
    const detail = Array.isArray(result.content)
      ? result.content.map(item => item?.text || '').filter(Boolean).join('\n')
      : '';
    throw new Error(detail || 'Shamela MCP tool returned an error');
  }
  if (result?.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent;
  }
  const textParts = Array.isArray(result?.content)
    ? result.content.map(item => String(item?.text || '')).filter(Boolean)
    : [];
  for (const value of textParts) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // Some MCP tools return prose alongside their structured result.
    }
  }
  return result || {};
}

function valueToText(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value.map(item => valueToText(item, depth + 1)).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    for (const key of ['text', 'content', 'plainText', 'value']) {
      if (typeof value[key] === 'string') return value[key];
    }
    return Object.values(value).map(item => valueToText(item, depth + 1)).filter(Boolean).join('\n');
  }
  return '';
}

function extractPageText(page) {
  const body = valueToText(page?.body || page?.matn || page?.text || '');
  const foot = valueToText(page?.foot || page?.footnotes || page?.footnotes_text || '');
  return {
    body: body.replace(/\n{3,}/gu, '\n\n').trim().slice(0, 7000),
    foot: foot.replace(/\n{3,}/gu, '\n\n').trim().slice(0, 2500),
  };
}

function makeSourceTitle(hit) {
  const book = String(hit?.book || hit?.book_name || 'نامعلوم کتاب').trim();
  const author = String(hit?.author || 'لیکوال نه دی ثبت شوی').trim();
  const printedPage = String(hit?.printedPage || hit?.printed_page || 'پاڼه نه ده ثبت شوې').trim();
  const matchedIn = String(hit?.matchedIn || hit?.matched_in || 'unknown').toLowerCase();
  const location = matchedIn === 'footnote'
    ? 'حاشیه'
    : matchedIn === 'body'
      ? 'اصلي متن'
      : matchedIn === 'both'
        ? 'متن او حاشیه'
        : 'د متن ځای نامعلوم';
  return book + ' — لیکوال: ' + author + ' — ټوک/مخ: ' + printedPage + ' — ' + location;
}

function formatShamelaResults(results) {
  if (!Array.isArray(results) || !results.length) return '';
  return results.slice(0, 3).map((item, index) => {
    return (index + 1) + '. *' + String(item.title || 'المكتبة الشاملة') + '*\n' +
      String(item.snippet || '').slice(0, 950) + '\n' +
      String(item.url || '');
  }).join('\n\n');
}

function createShamelaClient(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const readOpenRouterApiKey = options.readOpenRouterApiKey || (() => '');
  const model = String(options.model || 'openai/gpt-6-luna');
  const endpoint = String(options.endpoint || SHAMELA_MCP_ENDPOINT);
  const logger = options.logger || console;
  let requestId = 0;
  const resultCache = new Map();
  const inFlightSearches = new Map();
  const CACHE_TTL_MS = 5 * 60 * 1000;

  if (typeof fetchImpl !== 'function') {
    throw new TypeError('createShamelaClient requires fetch');
  }

  async function translateQuestionToArabic(question) {
    const value = String(question || '').trim().slice(0, 1200);
    if (!value) return '';
    if (HAS_ARABIC_SCRIPT.test(value) && !PASHTO_SPECIFIC_LETTERS.test(value)) {
      return value.replace(/[؟?!،,:;]+/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 180);
    }

    const apiKey = String(readOpenRouterApiKey() || '').trim();
    if (apiKey) {
      try {
        const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'X-Title': 'Maloomat AI - Shamela Search',
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            max_tokens: 100,
            messages: [
              {
                role: 'system',
                content: 'حوّل السؤال الديني المكتوب بالبشتوية إلى عبارة بحث عربية قصيرة مناسبة للبحث في كتب المكتبة الشاملة. أخرج كلمات بحث عربية فقط، من 3 إلى 10 كلمات، بلا شرح أو ترجمة حرفية مطولة. لا تجب عن السؤال ولا تخترع حديثاً أو حكماً.',
              },
              { role: 'user', content: value },
            ],
          }),
          signal: AbortSignal.timeout(9000),
        });
        if (response.ok) {
          const data = await response.json();
          const translated = String(data?.choices?.[0]?.message?.content || '')
            .replace(/^[\s"'«»]+|[\s"'«»]+$/gu, '')
            .replace(/\s+/gu, ' ')
            .trim()
            .slice(0, 180);
          if (HAS_ARABIC_SCRIPT.test(translated) && !PASHTO_SPECIFIC_LETTERS.test(translated)) {
            return translated;
          }
        } else {
          logger.warn?.('⚠️ د الشاملة د لټون لپاره عربي ژباړه ناکامه شوه؛ HTTP:', response.status);
        }
      } catch (error) {
        logger.warn?.('⚠️ د الشاملة لپاره د پوښتنې عربي ژباړه ناکامه شوه:', error?.message || error);
      }
    }
    return fallbackArabicSearchQuery(value);
  }

  async function callTool(name, args) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error('Shamela MCP HTTP ' + response.status + ': ' + detail.slice(0, 180));
    }
    return parseToolPayload(await response.json());
  }

  async function searchQuestionUncached(question) {
    const query = await translateQuestionToArabic(question);
    if (!query) return [];
    const scope = chooseShamelaScope(question);
    const result = await callTool('shamela_search_library', {
      query,
      scope,
      limit: DEFAULT_LIMIT,
    });
    const passages = Array.isArray(result?.passages) ? result.passages : [];
    const validHits = passages.filter(hit =>
      hit && Number.isInteger(Number(hit.bookId ?? hit.book_id)) &&
      Number.isInteger(Number(hit.pageId ?? hit.page_id)) &&
      String(hit.sourceUrl || hit.source_url || '').startsWith('https://qurangallery.com/maktabah/book/')
    ).slice(0, DEFAULT_LIMIT);

    const sources = [];
    for (let index = 0; index < validHits.length; index += 1) {
      const hit = validHits[index];
      let page = null;
      if (index < MAX_PAGE_READS) {
        try {
          page = await callTool('shamela_read', {
            unit: 'page',
            book_id: Number(hit.bookId ?? hit.book_id),
            page_id: Number(hit.pageId ?? hit.page_id),
          });
        } catch (error) {
          logger.warn?.('⚠️ د الشاملة د پاڼې لوستل ناکام شول؛ د لټون اصلي اقتباس ساتل کېږي:', error?.message || error);
        }
      }

      const pageText = extractPageText(page || {});
      const arabicExcerpt = String(hit.arabic || hit.excerpt || '').trim();
      const evidenceText = [
        pageText.body ? 'د بشپړې پاڼې متن (اصلي متن):\n' + pageText.body : '',
        pageText.foot ? 'د پاڼې حاشیه/پاورقی: \n' + pageText.foot : '',
        arabicExcerpt ? 'د لټون اړوند اصلي اقتباس:\n' + arabicExcerpt : '',
      ].filter(Boolean).join('\n\n');
      const title = makeSourceTitle(hit);
      sources.push({
        title,
        provider: 'المكتبة الشاملة — Quran Gallery MCP',
        url: String(hit.sourceUrl || hit.source_url),
        snippet: (evidenceText || arabicExcerpt).slice(0, 7000),
        book: String(hit.book || hit.book_name || ''),
        author: String(hit.author || ''),
        printedPage: String(hit.printedPage || hit.printed_page || ''),
        matchedIn: String(hit.matchedIn || hit.matched_in || 'unknown'),
        pageRead: Boolean(pageText.body || pageText.foot),
        edition: String(hit.edition || ''),
        publisher: String(hit.publisher || ''),
      });
    }
    return sources;
  }

  async function searchQuestion(question) {
    const key = String(question || '').normalize('NFKC').trim().toLowerCase();
    if (!key) return [];
    const cached = resultCache.get(key);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) return cached.sources;
    if (inFlightSearches.has(key)) return inFlightSearches.get(key);

    const pending = searchQuestionUncached(question);
    inFlightSearches.set(key, pending);
    try {
      const sources = await pending;
      if (sources.length) {
        resultCache.set(key, { time: Date.now(), sources });
        if (resultCache.size > 100) {
          const oldestKey = resultCache.keys().next().value;
          if (oldestKey) resultCache.delete(oldestKey);
        }
      }
      return sources;
    } finally {
      inFlightSearches.delete(key);
    }
  }

  return {
    searchQuestion,
    translateQuestionToArabic,
    callTool,
  };
}

module.exports = {
  SHAMELA_MCP_ENDPOINT,
  chooseShamelaScope,
  fallbackArabicSearchQuery,
  extractPageText,
  formatShamelaResults,
  createShamelaClient,
};
