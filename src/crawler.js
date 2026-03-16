const COMMON_PAGES = [
  '/contact',
  '/contact-us',
  '/about',
  '/about-us',
  '/team',
  '/editorial',
  '/staff',
  '/our-team',
  '/people',
];

const SOCIAL_DOMAINS = ['facebook.com', 'youtube.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com'];

const CRAWL_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 10000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url) {
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
  const extractor = self.extractorModule;
  if (!extractor) {
    throw new Error('extractorModule not loaded. Import extractor.js before crawler.js');
  }

  const baseUrl = normalizeUrl(url);
  const allPersonalEmails = [];
  const allCompanyEmails = [];
  const allPeople = [];
  const allSocialLinks = [];
  const visitedPages = new Set();
  let contactPageUrl = null;

  async function processPage(pageUrl, isContactPage) {
    if (visitedPages.has(pageUrl)) return;
    visitedPages.add(pageUrl);

    const html = await fetchPage(pageUrl);
    if (!html) return;

    if (isContactPage) {
      contactPageUrl = pageUrl;
    }

    const result = extractor.extractFromPage(html);
    allPersonalEmails.push(...result.personalEmails);
    allCompanyEmails.push(...result.companyEmails);
    allPeople.push(...result.people);

    const social = extractSocialLinks(html);
    allSocialLinks.push(...social);
  }

  await processPage(baseUrl, false);
  await processPage(baseUrl + '/', false);

  for (const page of COMMON_PAGES) {
    try {
      const pageUrl = baseUrl + page;
      const isContact = page.includes('contact');
      await delay(CRAWL_DELAY_MS);
      await processPage(pageUrl, isContact);
    } catch (e) {
    }
  }

  const uniqueSocial = [...new Set(allSocialLinks)];
  if (uniqueSocial.length > 0) {
    for (const socialUrl of uniqueSocial) {
      try {
        await delay(CRAWL_DELAY_MS);
        const socialHtml = await fetchPage(socialUrl);
        if (socialHtml) {
          const socialResult = extractor.extractFromPage(socialHtml);
          allCompanyEmails.push(...socialResult.companyEmails);
          allPersonalEmails.push(...socialResult.personalEmails);
        }
      } catch (e) {
      }
    }
  }

  const uniquePersonalEmails = [...new Set(allPersonalEmails)];
  const uniqueCompanyEmails = [...new Set(allCompanyEmails)];

  const uniquePeople = [];
  const seenPeople = new Set();
  for (const person of allPeople) {
    const key = `${person.name}|${person.role}`;
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
    contactPageUrl,
  };
}

if (typeof self !== 'undefined' && typeof self.crawlerModule === 'undefined') {
  self.crawlerModule = {
    crawlDomain,
    fetchPage,
    extractSocialLinks,
    normalizeUrl,
  };
}
