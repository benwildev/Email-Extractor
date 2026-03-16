const express = require('express');
const router = express.Router();
const { query } = require('../lib/db');

router.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM leads ORDER BY scanned_at DESC LIMIT 1000'
    );
    const leads = result.rows.map(row => ({
      id: row.id,
      domain: row.domain,
      name: row.name,
      email: row.email,
      contactEmail: row.contact_email,
      verificationScore: row.verification_score,
      verificationStatus: row.verification_status,
      mxRecords: row.mx_records || [],
      socialLinks: row.social_links || [],
      people: row.people || [],
      personalEmails: row.personal_emails || [],
      companyEmails: row.company_emails || [],
      verifications: row.verifications_json || {},
      savedAt: new Date(row.scanned_at).getTime(),
    }));
    res.json({ success: true, leads });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const v = d.verifications && d.email ? (d.verifications[d.email] || null) : null;
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
        d.domain || '',
        d.name || '',
        d.email || '',
        d.contactEmail || '',
        score,
        status,
        JSON.stringify(mxRecords),
        JSON.stringify(d.socialLinks || []),
        JSON.stringify(d.people || []),
        JSON.stringify(d.personalEmails || []),
        JSON.stringify(d.companyEmails || []),
        JSON.stringify(d.verifications || {}),
      ]
    );

    res.json({ success: true, id: result.rows[0].id, scanned_at: result.rows[0].scanned_at });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    await query('DELETE FROM leads WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
