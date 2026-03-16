---
title: Fix 502 crash: add server error guards and reduce crawl concurrency
---
# Fix 502 Crash on Upload

## What & Why
The server crashes during parallel batch processing, causing 502 Bad Gateway errors on unrelated endpoints like `/api/excel/upload`. With 5 concurrent rows each fetching 5 pages simultaneously (25 connections total), any unhandled rejection crashes the Node process. The server also has no global uncaught exception guard.

## Done looks like
- Uploading a file never returns 502 regardless of whether processing is active
- The server recovers from individual row/page failures without restarting
- Concurrent crawling is conservative enough to avoid memory exhaustion

## Out of scope
- Changing the processing UI or progress reporting

## Tasks
1. **Add crash guards to server/index.js** — Add `process.on('uncaughtException')` and `process.on('unhandledRejection')` handlers that log the error and keep the process alive instead of crashing.

2. **Reduce concurrency to safe limits** — Lower `ROW_CONCURRENCY` from 5 to 3 (in excel.js) and `PAGE_BATCH_SIZE` from 5 to 3 (in crawler.js), capping peak concurrent connections at 9 instead of 25. This is still 5-10x faster than the original sequential approach.

3. **Wrap runWorker in per-worker try/catch** — Ensure errors from individual worker promises don't cause Promise.all to reject and skip writing the SSE `complete` event and the final Excel export.

## Relevant files
- `server/index.js:33-44`
- `server/routes/excel.js:183` (ROW_CONCURRENCY)
- `server/routes/excel.js:286-295` (runWorker / Promise.all)
- `server/lib/crawler.js:75` (PAGE_BATCH_SIZE)