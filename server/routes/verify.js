const express = require('express');
const router = express.Router();
const { verifyEmail } = require('../lib/email-verifier');

router.post('/email', async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }
  try {
    const result = await verifyEmail(email.trim());
    res.json(result);
  } catch (err) {
    console.error('Verify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/emails', async (req, res) => {
  const { emails } = req.body;
  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'emails array is required' });
  }
  const list = emails.map(e => String(e).trim()).filter(Boolean).slice(0, 500);
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.flushHeaders();
  for (const email of list) {
    try {
      const result = await verifyEmail(email);
      res.write(JSON.stringify(result) + '\n');
    } catch (err) {
      res.write(JSON.stringify({ email, error: err.message, score: 0, status: 'error', valid: false }) + '\n');
    }
  }
  res.end();
});

module.exports = router;
