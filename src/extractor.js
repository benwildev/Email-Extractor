const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const OBFUSCATED_PATTERNS = [
  /([A-Z0-9._%+-]+)\s*\[at\]\s*([A-Z0-9.-]+)\s*\[dot\]\s*([A-Z]{2,})/gi,
  /([A-Z0-9._%+-]+)\s*\(at\)\s*([A-Z0-9.-]+)\s*\(dot\)\s*([A-Z]{2,})/gi,
  /([A-Z0-9._%+-]+)\s+AT\s+([A-Z0-9.-]+)\s+DOT\s+([A-Z]{2,})/gi,
];

const IGNORE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.ico', '.webp'];

const COMPANY_EMAIL_PREFIXES = /^(info|contact|hello|support|sales|office|press|media|editorial|admin|team|enquiries|enquiry|general|mail|help|business|partnerships|advertising|marketing|hr|careers|jobs|webmaster|postmaster)@/;

const LEADERSHIP_TITLES = [
  'CEO', 'Chief Executive Officer',
  'Founder', 'Co-Founder', 'Co Founder',
  'Editor', 'Editor-in-Chief', 'Editor in Chief',
  'Managing Editor',
  'Owner',
  'Director', 'Managing Director',
  'President', 'Vice President',
  'CTO', 'CFO', 'COO', 'CMO',
  'Head of', 'VP of',
];

const TITLE_REGEX = new RegExp(
  '(?:' + LEADERSHIP_TITLES.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
  'gi'
);

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
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  const emailsInText = extractEmails(text);

  const lines = text.split(/[.\n|;]+/).map(l => l.trim()).filter(l => l.length > 3 && l.length < 300);

  for (const line of lines) {
    TITLE_REGEX.lastIndex = 0;
    const titleMatch = TITLE_REGEX.exec(line);
    if (titleMatch) {
      const role = titleMatch[0].trim();
      const before = line.substring(0, titleMatch.index).trim();
      const after = line.substring(titleMatch.index + role.length).trim();

      let name = null;

      const namePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/;
      const beforeMatch = before.match(namePattern);
      const afterMatch = after.match(namePattern);

      if (beforeMatch) {
        name = beforeMatch[1].trim();
      } else if (afterMatch) {
        name = afterMatch[1].trim();
      }

      if (name && name.length > 2 && name.length < 50) {
        const exists = people.some(p => p.name === name && p.role === role);
        if (!exists) {
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

function extractFromPage(html) {
  if (!html) return { personalEmails: [], companyEmails: [], people: [] };

  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ');

  const emails = extractEmails(textContent);
  const hrefEmails = extractEmails(html);
  const allEmails = [...new Set([...emails, ...hrefEmails])];

  const { personalEmails, companyEmails } = separateEmails(allEmails);
  const people = extractKeyPeople(html);

  return { personalEmails, companyEmails, people };
}

if (typeof self !== 'undefined' && typeof self.extractorModule === 'undefined') {
  self.extractorModule = {
    extractEmails,
    extractObfuscatedEmails,
    extractKeyPeople,
    extractFromPage,
    separateEmails,
    isCompanyEmail,
    filterEmail,
  };
}
