const express = require('express');
const router = express.Router();
const { isValidPersonName } = require('../lib/extractor');
const { crawlDomain } = require('../lib/crawler');
const { selectBestResults } = require('../lib/extractor');

const FETCH_TIMEOUT_MS = 10000;

async function safeFetch(url, headers = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        ...headers,
      },
    });
    clearTimeout(id);
    if (!resp.ok) return null;
    return await resp.text();
  } catch (e) {
    clearTimeout(id);
    return null;
  }
}

function extractNamesFromText(text, domain) {
  const names = [];
  const patterns = [
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+is\s+(?:the\s+)?(?:founder|co-founder|ceo|chief\s+executive|editor(?:\s*-?in-?chief)?|owner|president|publisher|director)/gi,
    /(?:founder|co-founder|ceo|chief\s+executive|editor(?:\s*-?in-?chief)?|owner|president|publisher|director)[\s,]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/gi,
    /(?:founded|created|started|launched|run)\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:founded|created|started|launched)/gi,
    /About\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const candidate = m[1].trim().replace(/[.,!;:]+$/, '');
      if (isValidPersonName(candidate)) {
        names.push(candidate);
      }
    }
  }

  return [...new Set(names)];
}

async function searchDuckDuckGo(domain) {
  const query = '"@' + domain + '" founder OR CEO OR editor OR owner OR president';
  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
  const html = await safeFetch(url, { 'Accept-Language': 'en-US,en;q=0.9' });
  if (!html) return null;

  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ');

  const names = extractNamesFromText(text, domain);
  return names.length > 0 ? names[0] : null;
}

router.get('/name', async (req, res) => {
  const { domain, url } = req.query;
  if (!domain && !url) return res.status(400).json({ error: 'domain or url required' });

  const targetUrl = url || ('https://' + domain);
  const targetDomain = domain || targetUrl.replace(/^https?:\/\//, '').split('/')[0];

  try {
    const result = await crawlDomain(targetUrl);
    const best = selectBestResults(result);
    const nameOnly = best.name ? best.name.replace(/\s*\([^)]+\)\s*$/, '').trim() : '';

    if (nameOnly && nameOnly.length > 2) {
      return res.json({ name: best.name, source: 'crawl' });
    }

    const searchName = await searchDuckDuckGo(targetDomain);
    if (searchName) {
      return res.json({ name: searchName, source: 'search' });
    }

    res.json({ name: null, source: 'none' });
  } catch (err) {
    console.error('Lookup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
