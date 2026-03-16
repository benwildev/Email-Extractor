# Lead Extractor Pro - Setup & Usage Instructions

A powerful Chrome extension for lead extraction — extracts emails, key people, and social media links from websites. Supports single domain scanning, bulk scanning, and Google Sheets integration.

## Architecture

```
/manifest.json          — Chrome extension manifest (Manifest V3)
/src/extractor.js       — Email extraction engine (standard + obfuscated emails, key people detection)
/src/crawler.js         — Multi-page crawler (visits homepage + common subpages)
/src/background.js      — Service worker (orchestration, Sheets API, message handling)
/src/content.js         — Content script (on-page extraction on demand)
/ui/popup.html          — Extension popup interface
/ui/popup.js            — Popup logic (tabs, results, clipboard, CSV export)
/ui/styles.css          — Modern UI styles
/server.js              — Preview server for Replit (not part of the extension)
```

## Features

### Email Extraction
- Standard regex detection: `[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}`
- Obfuscated email detection:
  - `name [at] domain [dot] com`
  - `name(at)domain(dot)com`
  - `name AT domain DOT com`
- Filters out image/script/CSS file extensions and junk domains
- Deduplication and prioritization (prefers info@, contact@, hello@, etc.)

### Multi-Page Crawling
Automatically scans common pages for each domain:
- `/contact`, `/contact-us`
- `/about`, `/about-us`
- `/team`, `/our-team`, `/people`
- `/editorial`, `/staff`

### Key People Detection
Identifies leadership names near titles:
- CEO, Founder, Co-Founder
- Editor, Editor-in-Chief, Managing Editor
- Owner, Director, President
- CTO, CFO, COO, CMO

Returns structured data: `{ name: "John Smith", role: "CEO" }`

### Social Link Extraction
Detects links to: Facebook, YouTube, Instagram, LinkedIn, Twitter/X, TikTok

### Three Scanning Modes

1. **Single Scan** — Enter a URL and scan it immediately
2. **Google Sheets** — Read URLs from a spreadsheet, write results back automatically
3. **Bulk Scan** — Paste a list of domains (one per line) and scan them sequentially

### UI Features
- Modern tabbed interface
- Results table with domain, emails, people, and social links
- Email count badge
- Loading spinner
- Copy all emails to clipboard
- Export results to CSV

## Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the project root folder (the one containing `manifest.json`)
5. The extension icon will appear in your toolbar

## Google Sheets Setup (Optional)

### Step 1: Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., "Lead Extractor Pro")
3. Enable the **Google Sheets API** (search for it in the API library)
4. Configure **OAuth consent screen**:
   - Choose External
   - Add your email as a test user
5. Create **OAuth client ID**:
   - Type: Chrome extension
   - Application ID: Copy from `chrome://extensions` after loading the extension
6. Copy the **Client ID** and update `manifest.json` → `oauth2.client_id`

### Step 2: Prepare Your Sheet

1. Create a Google Sheet
2. Row 1 headers:
   - A1: `Target Links`
   - E1: `Contact`
   - F1: `Social Links`
   - G1: `Key People`
3. Paste target URLs in Column A starting from Row 2
4. Copy the **Spreadsheet ID** from the URL

### Step 3: Use the Extension

1. Click the extension icon
2. Go to the "Google Sheets" tab
3. Enter the Spreadsheet ID
4. Click "Authorize" and allow access
5. Click "Start" to begin extraction

## Performance

- Request throttling: 500ms delay between page fetches
- 10-second timeout per page request
- Async crawling with AbortController
- Deduplication across all pages and results
- Per-page error handling (one bad page won't stop the crawl)

## Troubleshooting

- **Error 403: "access_denied"**: Add your email to Test Users in the OAuth consent screen
- **Error: "OAuth2 not granted or revoked"**: Re-authorize via the extension popup
- **Error: "Sheets API Error"**: Ensure the Google Sheets API is enabled
- **No emails found**: The site may not have public emails; check manually
