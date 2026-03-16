# Lead Extractor Pro

## Overview
Full-stack web application that extracts emails, key people, and contact information from websites for SEO outreach. Includes email verification with MX record lookups and SMTP checks. Supports single domain scanning, bulk domain scanning, and Excel file (.xlsx) import/export.

## Project Structure
```
/server/index.js            — Express.js server entry point (port 5000)
/server/routes/scan.js      — Scan & verification API routes (/api/scan, /api/bulk-scan, /api/verify-email)
/server/routes/excel.js     — Excel file upload/process/download routes (/api/excel/*)
/server/lib/extractor.js    — Email extraction engine (standard + obfuscated, personal vs company, people detection with structured data/author parsing)
/server/lib/crawler.js      — Multi-page crawler (homepage + subpages + social pages)
/server/lib/email-verifier.js — Email verification (MX records, SMTP check, disposable detection, scoring)
/server/lib/excel.js        — Excel file parsing/writing (SheetJS xlsx)
/public/index.html          — Web app frontend
/public/css/styles.css      — Modern responsive UI styles
/public/js/app.js           — Frontend logic (tabs, SSE streaming, results table, file upload)
```

## Legacy Chrome Extension (kept for reference)
```
/manifest.json, /src/*, /ui/*  — Original Chrome extension files
```

## Excel File Column Mapping
- **Column C**: "Target Sites" — URLs to scan (READ)
- **Column H**: "Name" — Person name with role, e.g. "John Smith (CEO)" (WRITE)
- **Column I**: "Email" — Personal/leadership email, or best available email (WRITE)
- **Column J**: "Contact us" — Company/generic email or contact page URL (WRITE)
- **Column K**: "Niche" — User's niche data (PRESERVED, not written to)
- **Column L**: "Mail Verifier" — Email verification status with send rating (WRITE)
- Rows where Column I already has data are skipped

## Email Categorization
- **Personal emails**: Non-generic emails, especially those associated with detected leadership
- **Company emails**: Generic prefixes like info@, contact@, hello@, support@, etc.

## Email Verification
- Syntax validation
- DNS domain existence check
- MX record lookup (returns mail servers with priorities)
- SMTP connection check (RCPT TO verification)
- Disposable email domain detection (150+ domains)
- Verification score (0-100%)

## Key Features
- Standard + obfuscated email detection
- Enhanced people detection: leadership titles, structured data (schema.org), meta tags, author bylines, about-page natural language patterns
- Smart name validation: common English dictionary word filter, cookie/UI text filtering, name-only deduplication
- Expanded leadership roles: CEO, Founder, Editor, Director, Publisher, Content Manager, SEO Manager, etc.
- Multi-page crawling (/contact, /about, /team, /staff, /editorial, etc.)
- Social page crawling for additional emails
- Email verification with MX records and SMTP checks
- Mail Verifier column: shows Safe to Send / Risky / Unsafe rating with score percentage and visual bar
- Persistent Dashboard: all leads saved to localStorage, survives page reloads, shows total/verified/safe/risky stats
- Real-time progress via Server-Sent Events (SSE)
- Excel (.xlsx) file import/export — no API keys needed
- Results table with filtering, CSV export, clipboard copy
- Parallel row processing (5 concurrent rows) with domain-level caching
- Parallel page fetching within each domain (5 pages at a time)
- Early exit: stops crawling when a good on-domain email is found
- Request throttling (100ms), 6s timeouts, deduplication

## Running
- `node server/index.js` on port 5000
- Target: autoscale

## Dependencies
- express, cors, cheerio, xlsx, multer (npm)
- Node.js built-in: dns, net, http, fs, path, crypto
