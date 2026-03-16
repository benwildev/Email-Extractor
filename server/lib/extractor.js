const cheerio = require('cheerio');

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const OBFUSCATED_PATTERNS = [
  /([A-Z0-9._%+-]+)\s*\[at\]\s*([A-Z0-9.-]+)\s*\[dot\]\s*([A-Z]{2,})/gi,
  /([A-Z0-9._%+-]+)\s*\(at\)\s*([A-Z0-9.-]+)\s*\(dot\)\s*([A-Z]{2,})/gi,
  /([A-Z0-9._%+-]+)\s+AT\s+([A-Z0-9.-]+)\s+DOT\s+([A-Z]{2,})/gi,
];

const IGNORE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.ico', '.webp'];

const COMPANY_EMAIL_PREFIXES = /^(info|contact|hello|hi|support|sales|office|press|media|editorial|editors|editor|news|advertising|advert|digital|partnerships|admin|team|enquiries|enquiry|enquire|general|mail|help|business|marketing|hr|careers|jobs|webmaster|postmaster|ask|reach|tips|feedback|submissions|submit|contribute|guest|write|pitch|reservations|reservation|bookings|booking|orders|order|billing|accounts|payments|returns|shipping|delivery|events|service|services|reception|concierge|membership|noreply|no-reply|donotreply|newsletter|notifications|alerts|updates|deals|offers|promotions|customerservice|customercare|studio|hello)@/;

const LEADERSHIP_TITLES = [
  'CEO', 'Chief Executive Officer',
  'Founder', 'Co-Founder', 'Co Founder',
  'Editor', 'Editor-in-Chief', 'Editor in Chief',
  'Managing Editor', 'Senior Editor', 'Executive Editor',
  'Owner', 'Co-Owner',
  'Director', 'Managing Director', 'Creative Director', 'Communications Director',
  'President', 'Vice President',
  'CTO', 'CFO', 'COO', 'CMO', 'CIO', 'CISO',
  'Head of', 'VP of',
  'Publisher', 'Webmaster',
  'Content Manager', 'Brand Manager', 'PR Manager',
  'Outreach Manager', 'Marketing Manager', 'SEO Manager',
  'Chief of Staff', 'General Manager',
  'Principal', 'Partner',
];

const TITLE_REGEX = new RegExp(
  '(?:' + LEADERSHIP_TITLES.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
  'gi'
);

const HIGH_PRIORITY_ROLES = new Set([
  'ceo', 'chief executive officer',
  'founder', 'co-founder', 'co founder',
  'owner', 'co-owner',
  'president', 'vice president',
  'director', 'managing director', 'creative director', 'communications director',
  'publishing director',
  'cto', 'cfo', 'coo', 'cmo', 'cio', 'ciso',
  'publisher',
  'editor', 'editor-in-chief', 'editor in chief', 'managing editor', 'senior editor', 'executive editor',
  'associate editor',
  'principal', 'partner',
  'general manager',
  'head of', 'vp of',
  'content manager', 'brand manager', 'pr manager', 'outreach manager', 'marketing manager', 'seo manager',
]);

const EDITORIAL_ROLES = new Set([
  'editor', 'editor-in-chief', 'editor in chief', 'managing editor', 'senior editor',
  'executive editor', 'associate editor', 'editorial director',
  'founder', 'co-founder', 'co founder',
  'ceo', 'chief executive officer',
  'owner', 'co-owner',
  'publisher',
  'president',
]);

const NOT_A_NAME = new Set([
  'at', 'in', 'on', 'by', 'of', 'to', 'an', 'the', 'or', 'if',
  'do', 'be', 'is', 'as', 'up', 'my', 'we', 'he', 'she', 'it',
  'near', 'into', 'onto', 'upon', 'via',
  'mc', 'de', 'le', 'la', 'du', 'di', 'el', 'al',
  'staff', 'writer', 'interior', 'design', 'home', 'improvement',
  'continue', 'read', 'more', 'click', 'view', 'about', 'contact',
  'subscribe', 'share', 'next', 'previous', 'back', 'page', 'menu',
  'search', 'login', 'sign', 'blog', 'post', 'article', 'news',
  'category', 'comments', 'reply', 'submit', 'download', 'upload',
  'join', 'privacy', 'policy', 'terms', 'service', 'cookie', 'accept',
  'close', 'open', 'toggle', 'navigation', 'footer', 'header',
  'sidebar', 'widget', 'loading', 'error', 'success', 'welcome',
  'company', 'our', 'the', 'and', 'for', 'with', 'from', 'this',
  'that', 'your', 'all', 'are', 'was', 'has', 'been', 'will',
  'can', 'but', 'not', 'you', 'what', 'which', 'their',
  'real', 'estate', 'management', 'group', 'consulting',
  'digital', 'media', 'global', 'international',
  'properties', 'associates', 'holdings', 'ventures', 'capital',
  'marketing', 'technology', 'technologies', 'engineering', 'systems',
  'network', 'networks', 'innovations', 'innovation', 'industries',
  'industry', 'enterprise', 'enterprises', 'infrastructure', 'research',
  'financial', 'finance', 'insurance', 'healthcare', 'logistics',
  'software', 'hardware', 'security', 'solutions', 'services',
  'creative', 'agency', 'studio', 'labs', 'institute', 'foundation',
  'garage', 'floors', 'flooring', 'lasting', 'types', 'supplies', 'supply',
  'installation', 'installations', 'contracting', 'contractors', 'builders',
  'construction', 'renovation', 'renovations', 'repairs', 'cleaning',
  'painting', 'plumbing', 'roofing', 'tiling', 'landscaping',
  'windows', 'doors', 'kitchens', 'bathrooms', 'commercial', 'residential',
  'different', 'various', 'multiple', 'general', 'local', 'professional',
  'web', 'online', 'shop', 'store', 'new', 'best', 'top', 'free',
  'get', 'how', 'why', 'learn', 'find', 'see', 'try', 'start',
  'explore', 'discover', 'browse', 'show', 'hide', 'update', 'save',
  'edit', 'delete', 'remove', 'add', 'create', 'select', 'choose',
  'featured', 'popular', 'latest', 'trending', 'related', 'similar',
  'skip', 'main', 'content', 'section', 'building', 'house', 'review',
  'reviews', 'guide', 'guides', 'tips', 'resources', 'tools', 'projects',
  'portfolio', 'gallery', 'photos', 'images', 'video', 'videos',
  'social', 'follow', 'connect', 'send', 'message', 'call',
  'professional', 'certified', 'licensed', 'expert', 'specialists',
  'vila', 'nova', 'pro', 'plus', 'max', 'premium',
  'local', 'installation', 'repair', 'maintenance', 'construction',
  'roofing', 'plumbing', 'electrical', 'painting', 'flooring',
  'cleaning', 'remodeling', 'renovation', 'landscaping', 'moving',
  'sauna', 'experts', 'fitness', 'health', 'wellness', 'beauty',
  'salon', 'spa', 'clinic', 'dental', 'medical', 'legal', 'law',
  'financial', 'insurance', 'accounting', 'tax', 'investment',
  'custom', 'luxury', 'modern', 'classic', 'traditional', 'advanced',
  'complete', 'total', 'ultimate', 'supreme', 'elite', 'premier',
  'first', 'quality', 'standard', 'basic', 'full', 'express',
  'national', 'regional', 'local', 'city', 'state', 'county',
  'north', 'south', 'east', 'west', 'central', 'upper', 'lower',
  'greater', 'metro', 'urban', 'suburban', 'rural',
  'trusted', 'reliable', 'affordable', 'fast', 'quick', 'easy',
  'simple', 'smart', 'bright', 'clear', 'fresh', 'clean',
  'green', 'blue', 'red', 'white', 'black', 'golden', 'silver',
  'network', 'systems', 'platform', 'software', 'hardware',
  'industries', 'innovations', 'developments', 'brands',
  'reports', 'provides', 'offers', 'delivers', 'features',
  'includes', 'covers', 'supports', 'enables', 'allows',
  'works', 'helps', 'makes', 'gives', 'takes', 'gets',
  'uses', 'runs', 'needs', 'brings', 'keeps', 'lets',
  'shows', 'looks', 'goes', 'says', 'thinks', 'feels',
  'information', 'description', 'details', 'overview', 'summary',
  'announcement', 'notice', 'disclaimer', 'copyright', 'rights',
  'reserved', 'powered', 'built', 'designed', 'developed',
  'based', 'located', 'serving', 'providing', 'offering',
  'help', 'closings', 'closing', 'opening', 'buying', 'selling',
  'renting', 'leasing', 'listing', 'listings', 'pricing',
  'available', 'upcoming', 'current', 'recent', 'past',
  'general', 'request', 'requests', 'response', 'question', 'answer',
  'heights', 'plaines', 'plains', 'park', 'hill', 'hills', 'lake',
  'lakes', 'river', 'valley', 'creek', 'springs', 'grove', 'grove',
  'beach', 'bay', 'point', 'harbor', 'port', 'island', 'ridge',
  'view', 'haven', 'dale', 'field', 'wood', 'woods', 'forest',
  'bridge', 'crossing', 'landing', 'junction', 'falls', 'summit',
  'town', 'township', 'village', 'borough', 'estates',
]);

const COMMON_ENGLISH_WORDS = new Set([
  'always', 'never', 'every', 'only', 'just', 'still', 'even', 'also',
  'another', 'other', 'many', 'much', 'most', 'some', 'any', 'each',
  'both', 'such', 'very', 'quite', 'rather', 'really', 'almost',
  'customers', 'customer', 'think', 'things', 'thing', 'place', 'places',
  'necessary', 'enabled', 'disabled', 'required', 'optional',
  'stylish', 'outdoor', 'outdoors', 'indoor', 'indoors',
  'beautiful', 'amazing', 'perfect', 'wonderful', 'excellent', 'great',
  'awesome', 'fantastic', 'incredible', 'stunning', 'gorgeous', 'lovely',
  'elegant', 'unique', 'special', 'exclusive', 'original', 'authentic',
  'natural', 'organic', 'pure', 'real', 'true', 'genuine',
  'large', 'small', 'big', 'little', 'long', 'short', 'wide', 'narrow',
  'high', 'low', 'deep', 'tall', 'heavy', 'light', 'thick', 'thin',
  'happy', 'ready', 'right', 'wrong', 'good', 'bad', 'nice', 'fine',
  'warm', 'cool', 'cold', 'hot', 'dry', 'wet', 'soft', 'hard',
  'able', 'sure', 'safe', 'secure', 'private', 'public',
  'today', 'tomorrow', 'yesterday', 'now', 'then', 'here', 'there',
  'well', 'back', 'away', 'together', 'along', 'across', 'around',
  'different', 'important', 'possible', 'specific', 'certain', 'common',
  'entire', 'whole', 'single', 'double', 'triple', 'extra',
  'please', 'thank', 'sorry', 'okay', 'yes', 'hello',
  'made', 'done', 'set', 'put', 'keep', 'let', 'say', 'told',
  'come', 'went', 'give', 'take', 'make', 'know', 'see', 'want',
  'look', 'turn', 'move', 'live', 'play', 'work', 'run', 'try',
  'ask', 'tell', 'seem', 'feel', 'leave', 'call', 'bring',
  'begin', 'end', 'stop', 'change', 'grow', 'pay', 'meet', 'plan',
  'power', 'energy', 'force', 'water', 'fire', 'earth', 'space',
  'time', 'life', 'world', 'year', 'day', 'night', 'morning',
  'people', 'family', 'children', 'woman', 'women', 'man', 'men',
  'number', 'part', 'fact', 'case', 'week', 'month',
  'order', 'level', 'kind', 'hand', 'side', 'head', 'body',
  'room', 'door', 'wall', 'floor', 'window', 'table', 'chair',
  'food', 'water', 'money', 'price', 'cost', 'value', 'rate',
  'care', 'control', 'access', 'process', 'program', 'system',
  'issue', 'problem', 'reason', 'result', 'effect', 'cause',
  'point', 'fact', 'idea', 'plan', 'list', 'form', 'type',
  'step', 'line', 'word', 'name', 'book', 'story', 'game',
  'site', 'link', 'data', 'text', 'code', 'file', 'rule',
  'area', 'road', 'street', 'city', 'town', 'country', 'land',
  'outside', 'inside', 'above', 'below', 'between', 'under', 'over',
  'after', 'before', 'during', 'since', 'until', 'while',
  'through', 'against', 'without', 'within', 'beyond',
  'ever', 'already', 'often', 'enough', 'likely', 'simply',
  'truly', 'fully', 'early', 'late', 'far', 'near', 'close',
  'whether', 'though', 'although', 'however', 'therefore',
  'because', 'therefore', 'perhaps', 'maybe', 'probably',
]);

const MONTH_NAMES = new Set([
  'january', 'february', 'march', 'april', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]);

const NAME_SUFFIX_WHITELIST = new Set(['sterling', 'king', 'young', 'strong', 'manning', 'fleming', 'browning', 'cummings', 'hastings', 'jennings', 'rawlings', 'simmons', 'watkins', 'perkins', 'hawkins', 'collins', 'rollins']);

function isCommonWord(word) {
  const lower = word.toLowerCase();
  return NOT_A_NAME.has(lower) || COMMON_ENGLISH_WORDS.has(lower);
}

function isValidPersonName(name) {
  if (!name) return false;
  const words = name.split(/[\s]+/);
  if (words.length < 2 || words.length > 4) return false;

  for (const word of words) {
    const clean = word.replace(/['-]/g, '');
    if (clean.length < 2) return false;
    if (NOT_A_NAME.has(word.toLowerCase())) return false;
    if (MONTH_NAMES.has(word.toLowerCase())) return false;
    if (!/^[A-Z]/.test(word)) return false;
  }
  if (/^\d/.test(name)) return false;
  if (/\b(19|20)\d{2}\b/.test(name)) return false;

  let commonWordCount = 0;
  for (const word of words) {
    const lower = word.toLowerCase();
    if (NAME_SUFFIX_WHITELIST.has(lower)) continue;
    if (COMMON_ENGLISH_WORDS.has(lower)) commonWordCount++;
  }
  if (commonWordCount >= 2) return false;
  if (words.length === 2 && commonWordCount >= 1) {
    const otherWord = COMMON_ENGLISH_WORDS.has(words[0].toLowerCase()) ? words[1] : words[0];
    const otherLower = otherWord.toLowerCase();
    if (COMMON_ENGLISH_WORDS.has(otherLower) || NOT_A_NAME.has(otherLower)) return false;
  }

  let suspiciousSuffixCount = 0;
  const SUSPICIOUS_SUFFIXES = ['tion', 'ment', 'ness', 'ible', 'able', 'ful', 'less', 'ive', 'ity', 'ism', 'ics', 'ogy', 'phy'];
  for (const word of words) {
    const lower = word.toLowerCase();
    if (NAME_SUFFIX_WHITELIST.has(lower)) continue;
    for (const suffix of SUSPICIOUS_SUFFIXES) {
      if (lower.endsWith(suffix) && lower.length > 5) {
        suspiciousSuffixCount++;
        break;
      }
    }
  }
  if (suspiciousSuffixCount >= 2) return false;

  return true;
}

function filterEmail(email) {
  const lower = email.toLowerCase();
  if (IGNORE_EXTENSIONS.some(ext => lower.endsWith(ext))) return false;
  if (lower.includes('wixpress.com')) return false;
  if (lower.includes('sentry.io')) return false;
  if (lower.includes('example.com')) return false;
  if (lower.includes('domain.com')) return false;
  if (lower.includes('noreply')) return false;
  if (lower.includes('no-reply')) return false;
  if (lower.includes('sentry-next')) return false;
  if (lower.includes('cloudflare')) return false;
  return true;
}

function isCompanyEmail(email) {
  return COMPANY_EMAIL_PREFIXES.test(email.toLowerCase());
}

function extractStandardEmails(text) {
  if (!text) return [];
  const matches = text.match(EMAIL_REGEX) || [];
  return matches.map(e => e.toLowerCase()).filter(filterEmail);
}

function extractObfuscatedEmails(text) {
  if (!text) return [];
  const results = [];
  for (const pattern of OBFUSCATED_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const email = `${match[1]}@${match[2]}.${match[3]}`.toLowerCase();
      if (filterEmail(email)) {
        results.push(email);
      }
    }
  }
  return results;
}

function extractEmails(text) {
  const standard = extractStandardEmails(text);
  const obfuscated = extractObfuscatedEmails(text);
  return [...new Set([...standard, ...obfuscated])];
}

function separateEmails(emails) {
  const companyEmails = [];
  const personalEmails = [];
  for (const email of emails) {
    if (isCompanyEmail(email)) {
      companyEmails.push(email);
    } else {
      personalEmails.push(email);
    }
  }
  return { personalEmails, companyEmails };
}

function extractKeyPeople(html) {
  if (!html) return [];
  const people = [];

  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<div[^>]*(?:cookie|consent|gdpr|privacy[_-]?banner|cc-banner|cc_banner|cmplz|cookielaw|onetrust)[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<(?:nav|aside)[^>]*>[\s\S]*?<\/(?:nav|aside)>/gi, '')
    .replace(/<\/?(h[1-6]|p|li|div|section|article|header|footer|tr|td|th|blockquote|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  const emailsInText = extractEmails(text);

  const COOKIE_KEYWORDS = ['cookie', 'consent', 'gdpr', 'privacy policy', 'accept all', 'reject all', 'manage preferences', 'necessary cookies', 'functional cookies', 'analytics cookies', 'performance cookies', 'strictly necessary', 'always enabled', 'cookie settings', 'cookie notice'];

  function isCookieLine(line) {
    const lower = line.toLowerCase();
    let cookieHits = 0;
    for (const kw of COOKIE_KEYWORDS) {
      if (lower.includes(kw)) cookieHits++;
    }
    return cookieHits >= 2;
  }

  const lines = text.split(/[\n.;|]+/).map(l => l.trim()).filter(l => l.length > 3 && l.length < 300);
  const seenNames = new Set();

  for (const line of lines) {
    if (isCookieLine(line)) continue;
    TITLE_REGEX.lastIndex = 0;
    const titleMatch = TITLE_REGEX.exec(line);
    if (titleMatch) {
      const role = titleMatch[0].trim();
      const before = line.substring(Math.max(0, titleMatch.index - 80), titleMatch.index).trim();
      const after = line.substring(titleMatch.index + role.length, titleMatch.index + role.length + 80).trim();

      let name = null;

      const namePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/;
      const beforeMatch = before.match(namePattern);
      const afterMatch = after.match(namePattern);

      if (beforeMatch && isValidPersonName(beforeMatch[1].trim())) {
        name = beforeMatch[1].trim();
      } else if (afterMatch && isValidPersonName(afterMatch[1].trim())) {
        name = afterMatch[1].trim();
      }

      if (name) {
        const nameLower = name.toLowerCase();
        if (seenNames.has(nameLower)) continue;
        seenNames.add(nameLower);
        {
          const person = { name, role };

          const lineEmails = extractEmails(line);
          if (lineEmails.length > 0) {
            const nonCompany = lineEmails.filter(e => !isCompanyEmail(e));
            person.email = nonCompany.length > 0 ? nonCompany[0] : lineEmails[0];
          } else {
            const nameParts = name.toLowerCase().split(/\s+/);
            if (nameParts.length >= 2) {
              const firstName = nameParts[0];
              const lastName = nameParts[nameParts.length - 1];
              for (const email of emailsInText) {
                const local = email.split('@')[0];
                if (local.includes(firstName) || local.includes(lastName) ||
                    local === firstName + '.' + lastName ||
                    local === firstName[0] + lastName) {
                  person.email = email;
                  break;
                }
              }
            }
          }

          people.push(person);
        }
      }
    }
  }

  return people;
}

const AUTHOR_PATTERNS = [
  /(?:Written\s+by|Author[:\s]|Posted\s+by|Published\s+by|By\s)[\s:]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g,
  /class=["'][^"']*author[^"']*["'][^>]*>([^<]+)</gi,
];

const PAREN_ROLE_PATTERNS = [
  /(?:team\s+member|editorial\s+(?:team\s+)?member|editor|reviewer|expert|contributor|writer|author|contact|manager|director|founder|owner|our\s+\w+)\s*\(([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\)/gi,
  /\(([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\)\s+(?:will|is|has|who|can|would)\b/g,
];

function extractParenthesisNames(html) {
  if (!html) return [];
  const people = [];
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  const seenNames = new Set();
  for (const pattern of PAREN_ROLE_PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const name = m[1].trim().replace(/[.,!;:]+$/, '');
      if (!name || seenNames.has(name.toLowerCase())) continue;
      if (isValidPersonName(name)) {
        seenNames.add(name.toLowerCase());
        people.push({ name, role: 'Editor' });
      }
    }
  }
  return people;
}

const ABOUT_PAGE_PATTERNS = [
  /(?:My\s+name\s+is|I(?:'m|\s+am)\s)[\s,]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g,
  /(?:Hi[,!]?\s+I(?:'m|\s+am)\s)[\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g,
  /(?:Hello[,!]?\s+I(?:'m|\s+am)\s)[\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g,
  /(?:Founded\s+by|Created\s+by|Run\s+by|Managed\s+by|Operated\s+by|Started\s+by|Launched\s+by|Owned\s+by)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g,
  /(?:the\s+(?:founder|creator|owner|editor|author)\s+(?:of|behind))[^.]*?(?:is\s+|,\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/gi,
  /(?:content\s+is\s+(?:largely\s+)?(?:created|managed|written|produced)\s+(?:and\s+(?:managed|created|written)\s+)?by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/gi,
];

function extractAboutPagePeople(html) {
  if (!html) return [];
  const people = [];

  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  const seenNames = new Set();

  for (const pattern of ABOUT_PAGE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let name = match[1].trim();
      name = name.replace(/[.,!;:]+$/, '').trim();
      if (!name || name.length < 2 || name.length > 50) continue;

      const firstWord = name.split(/\s+/)[0];
      if (!/^[A-Z]/.test(firstWord)) continue;

      if (isCommonWord(firstWord) && name.split(/\s+/).length === 1) continue;

      const nameLower = name.toLowerCase();
      if (seenNames.has(nameLower)) continue;
      seenNames.add(nameLower);

      const words = name.split(/\s+/);
      if (words.length === 1) {
        if (!isCommonWord(words[0])) {
          people.push({ name, role: 'Owner' });
        }
      } else if (isValidPersonName(name)) {
        people.push({ name, role: 'Owner' });
      }
    }
  }

  return people;
}

function extractAuthors(html) {
  if (!html) return [];
  const authors = [];

  for (const pattern of AUTHOR_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const name = match[1].trim();
      if (name.length > 2 && name.length < 50 && /^[A-Z]/.test(name) && isValidPersonName(name)) {
        const exists = authors.some(a => a.name === name);
        if (!exists) {
          authors.push({ name, role: 'Author' });
        }
      }
    }
  }

  return authors;
}

function extractStructuredPeople(html) {
  if (!html) return [];
  const people = [];

  try {
    const $ = cheerio.load(html);

    $('[itemprop="author"], [rel="author"]').each((_, el) => {
      const name = $(el).text().trim();
      if (name && name.length > 2 && name.length < 50 && /[A-Z]/.test(name) && isValidPersonName(name)) {
        people.push({ name, role: 'Author' });
      }
    });

    $('meta[name="author"], meta[property="article:author"]').each((_, el) => {
      const name = $(el).attr('content');
      if (name && name.length > 2 && name.length < 50 && isValidPersonName(name.trim())) {
        people.push({ name: name.trim(), role: 'Author' });
      }
    });

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Person' && item.name && isValidPersonName(item.name.trim())) {
            people.push({ name: item.name.trim(), role: item.jobTitle || 'Person' });
          }
          if (item.author) {
            const authorList = Array.isArray(item.author) ? item.author : [item.author];
            for (const author of authorList) {
              if (typeof author === 'string' && isValidPersonName(author.trim())) {
                people.push({ name: author.trim(), role: 'Author' });
              } else if (author && author.name && isValidPersonName(author.name.trim())) {
                people.push({ name: author.name.trim(), role: author.jobTitle || 'Author' });
              }
            }
          }
        }
      } catch (e) {}
    });
  } catch (e) {}

  return people;
}

function extractFromPage(html, options = {}) {
  if (!html) return { personalEmails: [], companyEmails: [], people: [] };

  let textContent;
  try {
    const $ = cheerio.load(html);
    $('script').remove();
    $('style').remove();
    textContent = $.text();
  } catch (e) {
    textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ');
  }

  const emails = extractEmails(textContent);
  const hrefEmails = extractEmails(html);
  const allEmails = [...new Set([...emails, ...hrefEmails])];

  const { personalEmails, companyEmails } = separateEmails(allEmails);
  const titlePeople = extractKeyPeople(html);
  const structuredPeople = extractStructuredPeople(html);
  const authorPeople = extractAuthors(html);
  const aboutPeople = options.isAboutPage ? extractAboutPagePeople(html) : [];
  const parenPeople = extractParenthesisNames(html);

  const allPeople = [...titlePeople];
  const seenNames = new Set(titlePeople.map(p => p.name.toLowerCase()));

  for (const person of [...aboutPeople, ...structuredPeople, ...parenPeople, ...authorPeople]) {
    if (!seenNames.has(person.name.toLowerCase())) {
      seenNames.add(person.name.toLowerCase());
      allPeople.push(person);
    }
  }

  return { personalEmails, companyEmails, people: allPeople };
}

function nameFromEmail(email) {
  if (!email) return '';
  if (isCompanyEmail(email)) return '';

  const local = email.split('@')[0].toLowerCase();
  if (local.length < 3 || local.length > 40) return '';

  const dotParts = local.split(/[._-]/).filter(p => /^[a-z]+$/.test(p) && p.length >= 2);
  if (dotParts.length >= 2) {
    return dotParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  if (/^[a-z][a-z]{4,20}$/.test(local)) {
    const initial = local[0].toUpperCase();
    const surname = local.slice(1);
    return initial + '. ' + surname.charAt(0).toUpperCase() + surname.slice(1);
  }

  return '';
}

function selectBestResults(result) {
  let bestPerson = null;
  let bestPersonEmail = null;

  if (result.people.length > 0) {
    const isAuthor = p => p.role.toLowerCase() === 'author';
    const isEditorial = p => EDITORIAL_ROLES.has(p.role.toLowerCase());
    const isHighPriority = p => HIGH_PRIORITY_ROLES.has(p.role.toLowerCase());

    const editorialPeople = result.people.filter(isEditorial);
    const highPriority = result.people.filter(isHighPriority);
    const nonAuthorPeople = result.people.filter(p => !isAuthor(p));

    const editorialWithEmail = editorialPeople.filter(p => p.email);
    const highWithEmail = highPriority.filter(p => p.email);
    const nonAuthorWithEmail = nonAuthorPeople.filter(p => p.email);
    const allWithEmail = result.people.filter(p => p.email);

    if (editorialWithEmail.length > 0) {
      bestPerson = editorialWithEmail[0];
      bestPersonEmail = editorialWithEmail[0].email;
    } else if (editorialPeople.length > 0) {
      bestPerson = editorialPeople[0];
      if (result.personalEmails.length > 0) bestPersonEmail = result.personalEmails[0];
    } else if (highWithEmail.length > 0) {
      bestPerson = highWithEmail[0];
      bestPersonEmail = highWithEmail[0].email;
    } else if (highPriority.length > 0) {
      bestPerson = highPriority[0];
      if (result.personalEmails.length > 0) bestPersonEmail = result.personalEmails[0];
    } else if (nonAuthorWithEmail.length > 0) {
      bestPerson = nonAuthorWithEmail[0];
      bestPersonEmail = nonAuthorWithEmail[0].email;
    } else if (nonAuthorPeople.length > 0) {
      bestPerson = nonAuthorPeople[0];
      if (result.personalEmails.length > 0) bestPersonEmail = result.personalEmails[0];
    } else if (allWithEmail.length > 0) {
      bestPerson = allWithEmail[0];
      bestPersonEmail = allWithEmail[0].email;
    } else {
      bestPerson = result.people[0];
      if (result.personalEmails.length > 0) bestPersonEmail = result.personalEmails[0];
    }
  }

  if (!bestPersonEmail && result.personalEmails.length > 0) {
    bestPersonEmail = result.personalEmails[0];
  }

  const email = bestPersonEmail || (result.companyEmails.length > 0 ? result.companyEmails[0] : '');

  let contactEmail = '';
  const allEmails = [...result.companyEmails, ...result.personalEmails];
  for (const ce of allEmails) {
    if (ce !== email) {
      contactEmail = ce;
      break;
    }
  }

  const allFoundEmails = [...new Set([...result.personalEmails, ...result.companyEmails])];
  const emailDerivedName = (() => {
    const candidates = [email, ...allFoundEmails].filter(Boolean);
    for (const e of candidates) {
      const n = nameFromEmail(e);
      if (n) return n;
    }
    return '';
  })();

  let name = '';
  if (bestPerson) {
    const pageName = bestPerson.name;
    const pageLabel = pageName + (bestPerson.role ? ' (' + bestPerson.role + ')' : '');

    if (emailDerivedName) {
      const emailTokens = emailDerivedName.toLowerCase().replace(/\./g, '').split(/\s+/).filter(t => t.length > 2);
      const pageNameLower = pageName.toLowerCase();
      const consistent = emailTokens.some(token => pageNameLower.includes(token));
      name = consistent ? pageLabel : emailDerivedName;
    } else {
      name = pageLabel;
    }
  } else if (emailDerivedName) {
    name = emailDerivedName;
  }

  return { name, email, contactEmail, bestPerson };
}

module.exports = {
  nameFromEmail,
  extractEmails,
  extractObfuscatedEmails,
  extractKeyPeople,
  extractFromPage,
  separateEmails,
  isValidPersonName,
  isCompanyEmail,
  filterEmail,
  selectBestResults,
  extractAuthors,
  extractStructuredPeople,
  extractAboutPagePeople,
};
