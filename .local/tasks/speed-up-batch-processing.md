# Speed Up Batch Processing

## What & Why
Processing 169 rows currently takes 70+ minutes. The crawler fetches each site's pages one-by-one with a 500ms forced sleep between every page, and all rows are processed sequentially (one at a time). This makes large sheets unusable in practice.

## Done looks like
- Processing 169 rows completes in under 15 minutes (4-5x faster)
- Multiple rows are processed at the same time (5 concurrent)
- Same-domain rows reuse the first crawl result instead of re-crawling
- Crawling stops early for a site once a good on-domain email is found
- The progress log and download still work exactly as before during parallel processing

## Out of scope
- Changing email extraction logic or name extraction
- UI redesign of the progress panel

## Tasks
1. **Reduce per-page delays and timeout** — Cut CRAWL_DELAY_MS from 500ms to 100ms and FETCH_TIMEOUT_MS from 10000ms to 6000ms in the crawler.

2. **Parallel page fetching within each domain** — Replace the sequential COMMON_PAGES and discoveredLinks loops with parallel batch fetching (5 pages at a time using Promise.all), so a single domain's ~35 pages are fetched in batches instead of one by one.

3. **Early exit after finding a good email** — After crawling the homepage and high-value pages (contact/about/email), if a good on-domain email is already found, skip all remaining common pages and discovered links.

4. **Parallel row processing with domain cache** — Replace the sequential `for` loop over the queue in the process route with a concurrency-limited runner that processes up to 5 rows at the same time. Add a domain cache so if the same base domain appears more than once in the sheet, it's only crawled once and the result is reused instantly for duplicates.

## Relevant files
- `server/lib/crawler.js:70-71` (CRAWL_DELAY_MS, FETCH_TIMEOUT_MS)
- `server/lib/crawler.js:205-242` (sequential page loops)
- `server/routes/excel.js:189-260` (sequential row processing loop)
