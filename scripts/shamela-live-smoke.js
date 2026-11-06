'use strict';

const { createShamelaClient } = require('../lib/shamela-mcp');

async function main() {
  const question = 'د ږیرې خریل څه حکم لري؟';
  const client = createShamelaClient({
    readOpenRouterApiKey: () => '',
    logger: console,
  });

  const sources = await client.searchQuestion(question);
  if (!sources.length) {
    throw new Error('د الشاملة له کتابتون څخه د دې واقعي پښتو پوښتنې لپاره سرچینه پیدا نه شوه.');
  }

  const source = sources[0];
  for (const field of ['book', 'author', 'printedPage', 'url', 'snippet']) {
    if (!String(source[field] || '').trim()) {
      throw new Error('د الشاملة د سرچینې مهم معلومات نیمګړي دي: ' + field);
    }
  }
  if (!source.pageRead) {
    throw new Error('د الشاملة د لټون پایله وموندل شوه، خو د بشپړې پاڼې لوستل تایید نه شول.');
  }

  console.log('PASS — واقعي پښتو پوښتنه د الشاملة له کتابتون سره ونښلول شوه.');
  console.log('پوښتنه: ' + question);
  console.log('کتاب: ' + source.book);
  console.log('لیکوال: ' + source.author);
  console.log('چاپي ټوک/مخ: ' + source.printedPage);
  console.log('د پاڼې متن ولوستل شو: هو');
  console.log('سرچینه: ' + source.url);
}

main().catch(error => {
  console.error('FAIL — د الشاملة واقعي اتصال ناکام شو:', error?.message || error);
  process.exitCode = 1;
});
