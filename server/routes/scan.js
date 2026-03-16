const express = require('express');
const router = express.Router();
const { query } = require('../lib/db');

async function saveLead(data) {
  try {
    const v = data.verifications && data.email ? (data.verifications[data.email] || null) : null;
    const score = v ? (v.score != null ? v.score : null) : null;
    const status = v ? (v.status || null) : null;
    const mxRecords = v ? (v.mxRecords || []) : [];

    const result = await query(
      `INSERT INTO leads
        (domain, name, email, contact_email, verification_score, verification_status,
         mx_records, social_links, people, personal_emails, company_emails, verifications_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, scanned_at`,
      [
        data.domain || '',
        data.name || '',
        data.email || '',
        data.contactEmail || '',
        score,
        status,
        JSON.stringify(mxRecords),
        JSON.stringify(data.socialLinks || []),
        JSON.stringify(data.people || []),
        JSON.stringify(data.personalEmails || []),
        JSON.stringify(data.companyEmails || []),
        JSON.stringify(data.verifications || {}),
      ]
    );
    return result.rows[0];
  } catch (e) {
    console.error('Failed to save lead to DB:', e.message);
    return null;
  }
}

router.post('/scan', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const { crawlDomain } = require('../lib/crawler');
    const { selectBestResults } = require('../lib/extractor');
    const { verifyEmail } = require('../lib/email-verifier');

    const result = await crawlDomain(url);
    const best = selectBestResults(result);

    const verifications = {};
    const allEmails = [...new Set([
      ...(result.personalEmails || []),
      ...(result.companyEmails || [])
    ])];

    for (const email of allEmails.slice(0, 10)) {
      try {
        verifications[email] = await verifyEmail(email);
      } catch (e) {
        verifications[email] = { email, valid: false, error: e.message };
      }
    }

    const data = {
      domain: url,
      name: best.name,
      email: best.email,
      contactEmail: best.contactEmail,
      people: result.people,
      personalEmails: result.personalEmails,
      companyEmails: result.companyEmails,
      socialLinks: result.socialLinks,
      verifications,
    };

    const saved = await saveLead(data);
    if (saved) {
      data.id = saved.id;
      data.savedAt = new Date(saved.scanned_at).getTime();
    }

    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/bulk-scan', async (req, res) => {
  const { domains } = req.body;
  if (!domains || !Array.isArray(domains) || domains.length === 0) {
    return res.status(400).json({ error: 'Domains array is required' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const { crawlDomain } = require('../lib/crawler');
  const { selectBestResults } = require('../lib/extractor');
  const { verifyEmail } = require('../lib/email-verifier');

  const total = domains.length;
  let foundTotal = 0;

  for (let i = 0; i < total; i++) {
    const domain = domains[i].trim();
    if (!domain) continue;

    res.write(`data: ${JSON.stringify({ type: 'progress', current: i + 1, total, domain })}\n\n`);

    try {
      const result = await crawlDomain(domain);
      const best = selectBestResults(result);

      const verifications = {};
      const primaryEmails = [best.email, best.contactEmail].filter(Boolean);
      for (const email of [...new Set(primaryEmails)].slice(0, 3)) {
        try {
          verifications[email] = await verifyEmail(email);
        } catch (e) {
          verifications[email] = { email, valid: false, error: e.message };
        }
      }

      if (best.email) foundTotal++;

      const bulkData = {
        domain,
        name: best.name,
        email: best.email,
        contactEmail: best.contactEmail,
        people: result.people,
        personalEmails: result.personalEmails,
        companyEmails: result.companyEmails,
        socialLinks: result.socialLinks,
        verifications,
      };

      const saved = await saveLead(bulkData);
      if (saved) {
        bulkData.id = saved.id;
        bulkData.savedAt = new Date(saved.scanned_at).getTime();
      }

      res.write(`data: ${JSON.stringify({
        type: 'result',
        data: bulkData,
        stats: { processed: i + 1, found: foundTotal, total }
      })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        domain,
        error: e.message,
        stats: { processed: i + 1, found: foundTotal, total }
      })}\n\n`);
    }
  }

  res.write(`data: ${JSON.stringify({ type: 'complete', stats: { processed: total, found: foundTotal, total } })}\n\n`);
  res.end();
});

router.post('/verify-email', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const { verifyEmail } = require('../lib/email-verifier');
    const result = await verifyEmail(email);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
