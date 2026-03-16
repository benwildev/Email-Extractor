const crawler = require('./server/lib/crawler');
const extractor = require('./server/lib/extractor');

// MUST patch before requiring, but since it's already cached in Node's require...
// We can just rely on the fact that we can re-export or just use the crawler object.
const originalFetch = crawler.fetchPage;
crawler.fetchPage = async (u) => {
  console.log('  [FETCH] Visiting:', u);
  return originalFetch(u);
};

async function test() {
  const url = 'radical.fm';
  console.log('Crawling', url);
  
  const result = await crawler.crawlDomain(url);
  console.log('\nRAW RESULT:', JSON.stringify(result, null, 2));
  
  const best = extractor.selectBestResults(result);
  console.log('\nBEST RESULT:', JSON.stringify(best, null, 2));
}

test().catch(console.error);
