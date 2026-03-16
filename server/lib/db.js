const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode') ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      domain TEXT,
      name TEXT,
      email TEXT,
      contact_email TEXT,
      verification_score INTEGER,
      verification_status TEXT,
      mx_records JSONB,
      social_links JSONB,
      people JSONB,
      personal_emails JSONB,
      company_emails JSONB,
      verifications_json JSONB,
      scanned_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

module.exports = { query, initDb };
