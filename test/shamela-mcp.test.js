'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  chooseShamelaScope,
  fallbackArabicSearchQuery,
  extractPageText,
  formatShamelaResults,
  createShamelaClient,
} = require('../lib/shamela-mcp');

test('chooses a relevant library shelf for common Islamic research topics', () => {
  assert.equal(chooseShamelaScope('د حدیث سند او درجه څه ده؟'), 'hadith-sciences');
  assert.equal(chooseShamelaScope('د قرآن تفسیر'), 'tafsir-canonical');
  assert.equal(chooseShamelaScope('د حنفي فقهې حکم'), 'fiqh-hanafi');
  assert.equal(chooseShamelaScope('د عقیدې موضوع'), 'aqeedah');
});

test('has Arabic fallback terms for common Pashto religious queries', () => {
  assert.match(fallbackArabicSearchQuery('د ږیرې خریل څه حکم لري؟'), /حلق اللحية/);
  assert.match(fallbackArabicSearchQuery('وعده او تورق څه دي؟'), /التورق/);
  assert.equal(fallbackArabicSearchQuery('یوه نامعلومه موضوع'), '');
  assert.match(fallbackArabicSearchQuery('د اسلام دین څه دی؟'), /تعريف الإسلام/);
});

test('extracts the body and footnotes separately from a Shamela page response', () => {
  assert.deepEqual(
    extractPageText({ body: ['د کتاب اصلي متن'], foot: ['د محقق حاشیه'] }),
    { body: 'د کتاب اصلي متن', foot: 'د محقق حاشیه' },
  );
});

test('searches Arabic terms and reads the printed page before returning a citation', async () => {
  const calls = [];
  const fetchImpl = async (_url, request) => {
    const payload = JSON.parse(request.body);
    calls.push(payload);
    const toolName = payload.params.name;
    const responseData = toolName === 'shamela_search_library'
      ? {
          passages: [{
            book: 'فتح الباري',
            author: 'ابن حجر',
            bookId: 111,
            pageId: 222,
            printedPage: '1/ 100',
            edition: 'ط معروفة',
            publisher: 'دار',
            matchedIn: 'body',
            arabic: 'هذا اقتباس عربي موثق من متن الكتاب.',
            sourceUrl: 'https://qurangallery.com/maktabah/book/111/222',
          }],
        }
      : {
          book_name: 'فتح الباري',
          printed_page: '1/ 100',
          body: 'هذا هو نص الصفحة الكامل من الكتاب.',
          foot: 'حاشية المحقق.',
        };
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', id: payload.id, result: { structuredContent: responseData } }),
      text: async () => '',
    };
  };

  const client = createShamelaClient({
    fetchImpl,
    readOpenRouterApiKey: () => '',
    rateLimitStorePath: require('node:path').join(
      require('node:os').tmpdir(),
      'maloomat-shamela-mcp-test-' + process.pid + '-' + Date.now() + '.json',
    ),
    logger: { warn() {} },
  });
  const results = await client.searchQuestion('د ږیرې خریل څه حکم لري؟');

  assert.equal(calls.length, 2);
  assert.equal(calls[0].params.name, 'shamela_search_library');
  assert.match(calls[0].params.arguments.query, /اللحية/);
  assert.equal(calls[0].params.arguments.scope, 'fiqh-comparative');
  assert.equal(calls[1].params.name, 'shamela_read');
  assert.deepEqual(calls[1].params.arguments, { unit: 'page', book_id: 111, page_id: 222 });
  assert.equal(results.length, 1);
  assert.match(results[0].title, /ابن حجر/);
  assert.match(results[0].title, /1\/ 100/);
  assert.equal(results[0].pageRead, true);
  assert.match(results[0].snippet, /نص الصفحة الكامل/);
  assert.match(formatShamelaResults(results), /qurangallery.com/);
});

