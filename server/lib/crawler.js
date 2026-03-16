const dns = require('dns');
const extractor = require('./extractor');

const BLOCKED_HOSTS = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|0\.0\.0\.0|::1|\[::1\]|169\.254\.\d+\.\d+|metadata\.google\.internal)$/i;

function isSafeUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (BLOCKED_HOSTS.test(parsed.hostname)) return false;
    return true;
  } catch (e) {
    return false;
  }
}

const COMMON_PAGES = [
  '/contact',
  '/contact-us',
  '/contact-me',
  '/about',
  '/about-us',
  '/about-me',
  '/team',
  '/editorial',
  '/staff',
  '/our-team',
  '/people',
  '/bio',
  '/our-story',
  '/who-we-are',
  '/page/contact',
  '/page/contact-us',
  '/pages/contact',
  '/pages/contact-us',
  '/pages/about',
  '/company/contact',
  '/info/contact',
  '/email',
  '/email-us',
  '/reach-us',
  '/get-in-touch',
  '/connect',
  '/hire-us',
  '/work-with-us',
  '/advertise',
  '/partnerships',
  '/press',
  '/media-kit',
  '/write-for-us',
  '/write-with-us',
  '/guest-post',
  '/guest-posting',
  '/guest-post-guidelines',
  '/contribute',
  '/submit',
  '/submit-a-guest-post',
  '/submit-content',
  '/write',
  '/work-with-us',
];

const ABOUT_PAGE_PATTERNS = ['/about', '/about-us', '/about-me', '/bio', '/our-story', '/who-we-are', '/team', '/our-team', '/author', '/writer', '/contributor', '/editorial', '/staff', '/people'];
const CONTACT_PAGE_PATTERNS = ['/contact', '/contact-us', '/contact-me', '/reach-us', '/get-in-touch', '/connect', '/email', '/write-for-us', '/write-with-us', '/guest-post', '/contribute'];

const CONTACT_LINK_KEYWORDS = /contact|about|team|editorial|staff|people|press|media|enquir|author|writer|contributor|who-we-are|our-story|write-for-us|write-with-us|guest-post|contribute|submit|email-us|email|reach-us|hire|advertis|partner|connect/i;

const SOCIAL_DOMAINS = ['facebook.com', 'youtube.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com'];

const CRAWL_DELAY_MS = 100;
const FETCH_TIMEOUT_MS = 6000;
const PAGE_BATCH_SIZE = 3;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url) {
  if (!isSafeUrl(url)) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EmailExtractor/1.0)',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;
    return await response.text();
  } catch (e) {
    return null;
  }
}

function discoverContactLinks(html, baseUrl) {
  if (!html) return [];
  const discovered = [];
  try {
    const origin = new URL(baseUrl).origin;
    const hrefRegex = /href=["']([^"']+)["']/g;
    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
      let href = match[1];
      if (href.startsWith('mailto:') || href.startsWith('#') || href.startsWith('javascript:')) continue;
      try {
        const resolved = href.startsWith('http') ? href : origin + (href.startsWith('/') ? href : '/' + href);
        const parsed = new URL(resolved);
        if (parsed.origin !== origin) continue;
        const path = parsed.pathname;
        if (CONTACT_LINK_KEYWORDS.test(path)) {
          const clean = origin + path;
          if (!COMMON_PAGES.some(p => origin + p === clean)) {
            discovered.push(clean);
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
  return [...new Set(discovered)].slice(0, 15);
}

function extractSocialLinks(html) {
  if (!html) return [];
  const links = [];
  const hrefRegex = /href=["'](https?:\/\/[^"']+)["']/g;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const link = match[1];
    if (SOCIAL_DOMAINS.some(domain => link.includes(domain))) {
      links.push(link);
    }
  }
  return [...new Set(links)];
}

function normalizeUrl(url) {
  let targetUrl = url.trim();
  if (!targetUrl.startsWith('http')) {
    targetUrl = 'https://' + targetUrl;
  }
  try {
    const parsed = new URL(targetUrl);
    return parsed.origin;
  } catch (e) {
    return targetUrl;
  }
}

async function crawlDomain(url) {
  const baseUrl = normalizeUrl(url);
  const allPersonalEmails = [];
  const allCompanyEmails = [];
  const allPeople = [];
  const allSocialLinks = [];
  const visitedPages = new Set();
  function isAboutPage(pageUrl) {
    try {
      const path = new URL(pageUrl).pathname.toLowerCase();
      return ABOUT_PAGE_PATTERNS.some(p => path.includes(p));
    } catch (e) {
      return false;
    }
  }

  function isHighValuePage(pageUrl) {
    try {
      const path = new URL(pageUrl).pathname.toLowerCase();
      return ABOUT_PAGE_PATTERNS.some(p => path.includes(p)) ||
             CONTACT_PAGE_PATTERNS.some(p => path.includes(p));
    } catch (e) {
      return false;
    }
  }

  async function processPage(pageUrl) {
    if (visitedPages.has(pageUrl)) return;
    visitedPages.add(pageUrl);

    const html = await fetchPage(pageUrl);
    if (!html) return;

    const highValue = isHighValuePage(pageUrl);
    const result = extractor.extractFromPage(html, { isAboutPage: isAboutPage(pageUrl) });

    if (highValue) {
      allPersonalEmails.unshift(...result.personalEmails);
      allCompanyEmails.unshift(...result.companyEmails);
      allPeople.unshift(...result.people);
    } else {
      allPersonalEmails.push(...result.personalEmails);
      allCompanyEmails.push(...result.companyEmails);
      allPeople.push(...result.people);
    }

    const social = extractSocialLinks(html);
    allSocialLinks.push(...social);
  }

  const siteDomainEarly = (() => {
    try { return new URL(baseUrl).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  })();

  function hasGoodEmail() {
    if (!siteDomainEarly) return false;
    const all = [...allPersonalEmails, ...allCompanyEmails];
    return all.some(e => e.toLowerCase().endsWith('@' + siteDomainEarly));
  }

  async function processBatch(urls) {
    await delay(CRAWL_DELAY_MS);
    await Promise.all(urls.map(u => processPage(u).catch(() => {})));
  }

  await processPage(baseUrl);
  if (!visitedPages.has(baseUrl + '/')) {
    await processPage(baseUrl + '/');
  }

  const homepageHtml = await fetchPage(baseUrl);
  const discoveredLinks = discoverContactLinks(homepageHtml, baseUrl);

  const highValuePaths = COMMON_PAGES.filter(p =>
    CONTACT_PAGE_PATTERNS.some(cp => p.includes(cp)) ||
    ABOUT_PAGE_PATTERNS.some(ap => p.includes(ap))
  );
  const lowValuePaths = COMMON_PAGES.filter(p => !highValuePaths.includes(p));

  for (let i = 0; i < highValuePaths.length; i += PAGE_BATCH_SIZE) {
    const batch = highValuePaths.slice(i, i + PAGE_BATCH_SIZE).map(p => baseUrl + p);
    await processBatch(batch);
  }

  if (!hasGoodEmail()) {
    for (let i = 0; i < lowValuePaths.length; i += PAGE_BATCH_SIZE) {
      const batch = lowValuePaths.slice(i, i + PAGE_BATCH_SIZE).map(p => baseUrl + p);
      await processBatch(batch);
      if (hasGoodEmail()) break;
    }
  }

  if (!hasGoodEmail() && discoveredLinks.length > 0) {
    for (let i = 0; i < discoveredLinks.length; i += PAGE_BATCH_SIZE) {
      const batch = discoveredLinks.slice(i, i + PAGE_BATCH_SIZE);
      await processBatch(batch);
      if (hasGoodEmail()) break;
    }
  }

  const uniqueSocial = [...new Set(allSocialLinks)];
  if (!hasGoodEmail() && uniqueSocial.length > 0) {
    for (let i = 0; i < uniqueSocial.length; i += PAGE_BATCH_SIZE) {
      const batch = uniqueSocial.slice(i, i + PAGE_BATCH_SIZE);
      await delay(CRAWL_DELAY_MS);
      await Promise.all(batch.map(async (socialUrl) => {
        try {
          const socialHtml = await fetchPage(socialUrl);
          if (socialHtml) {
            const socialResult = extractor.extractFromPage(socialHtml);
            allCompanyEmails.push(...socialResult.companyEmails);
            allPersonalEmails.push(...socialResult.personalEmails);
          }
        } catch (e) {}
      }));
      if (hasGoodEmail()) break;
    }
  }

  const siteDomain = siteDomainEarly;

  function filterByDomain(emails, domain) {
    const all = [...new Set(emails)];
    if (!domain) return all;
    const onDomain = all.filter(e => e.toLowerCase().endsWith('@' + domain));
    if (onDomain.length > 0) return onDomain;
    return all;
  }

  const uniquePersonalEmails = filterByDomain(allPersonalEmails, siteDomain);
  const uniqueCompanyEmails = filterByDomain(allCompanyEmails, siteDomain);

  const uniquePeople = [];
  const seenPeople = new Set();
  for (const person of allPeople) {
    const key = person.name.toLowerCase();
    if (!seenPeople.has(key)) {
      seenPeople.add(key);
      uniquePeople.push(person);
    }
  }

  return {
    personalEmails: uniquePersonalEmails,
    companyEmails: uniqueCompanyEmails,
    people: uniquePeople,
    socialLinks: uniqueSocial,
  };
}

module.exports = {
  crawlDomain,
  fetchPage,
  extractSocialLinks,
  normalizeUrl,
};
