const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { parseExcelFile, writeResultsToExcel, getSheetPreview, getSheetPreviewFromWorkbook } = require('../lib/excel');
const XLSX = require('xlsx');
const { query } = require('../lib/db');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

async function saveLeadFromExcel(domain, name, email, contactEmail, verificationStatus, verificationScore) {
  try {
    const score = verificationScore != null ? verificationScore : null;
    const status = verificationStatus && verificationStatus !== 'Error' ? verificationStatus : null;
    await query(
      `INSERT INTO leads
        (domain, name, email, contact_email, verification_score, verification_status,
         mx_records, social_links, people, personal_emails, company_emails, verifications_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        domain || '',
        name || '',
        email || '',
        contactEmail || '',
        score,
        status,
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify({}),
      ]
    );
  } catch (e) {
    console.error('Failed to save Excel lead to DB:', e.message);
  }
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const fileStore = new Map();

function filePath(fileId) { return path.join(UPLOADS_DIR, fileId + '.xlsx'); }
function metaPath(fileId) { return path.join(UPLOADS_DIR, fileId + '.json'); }
function progressPath(fileId) { return path.join(UPLOADS_DIR, fileId + '.progress.json'); }

function saveMeta(fileId, meta) {
  fs.writeFileSync(metaPath(fileId), JSON.stringify(meta));
}

function loadMeta(fileId) {
  try { return JSON.parse(fs.readFileSync(metaPath(fileId), 'utf8')); } catch { return null; }
}

function saveProgress(fileId, progressMap) {
  fs.writeFileSync(progressPath(fileId), JSON.stringify(progressMap));
}

function loadProgress(fileId) {
  try { return JSON.parse(fs.readFileSync(progressPath(fileId), 'utf8')); } catch { return {}; }
}

function restoreFromDisk() {
  try {
    const files = fs.readdirSync(UPLOADS_DIR).filter(f => f.endsWith('.xlsx'));
    let count = 0;
    for (const f of files) {
      const fileId = f.replace('.xlsx', '');
      const meta = loadMeta(fileId);
      if (!meta) continue;
      fileStore.set(fileId, {
        buffer: null,
        originalName: meta.originalName,
        sheetName: meta.sheetName,
        createdAt: meta.createdAt,
        processed: meta.processed || false,
        _onDisk: true,
      });
      count++;
    }
    console.log(`Registered ${count} file(s) from disk (lazy load).`);
  } catch (e) {
    console.error('Error restoring files from disk:', e.message);
  }
}

function ensureBuffer(fileId) {
  const entry = fileStore.get(fileId);
  if (!entry) return null;
  if (!entry.buffer && entry._onDisk) {
    try {
      entry.buffer = fs.readFileSync(filePath(fileId));
    } catch (e) {
      fileStore.delete(fileId);
      return null;
    }
  }
  return entry;
}

restoreFromDisk();

setInterval(() => {
  const now = Date.now();
  const cutoff = 24 * 3600000;
  for (const [id, entry] of fileStore) {
    if (now - entry.createdAt > cutoff) {
      fileStore.delete(id);
      try { fs.unlinkSync(filePath(id)); } catch {}
      try { fs.unlinkSync(metaPath(id)); } catch {}
      try { fs.unlinkSync(progressPath(id)); } catch {}
    }
  }
}, 600000);

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const sheetName = req.body.sheetName || '';
  const startRow = req.body.startRow || '';
  const endRow = req.body.endRow || '';

  try {
    const { queue, sheetName: resolvedSheet, sheetNames } = parseExcelFile(req.file.buffer, sheetName || undefined, startRow, endRow);
    const fileId = crypto.randomBytes(12).toString('hex');

    fs.writeFileSync(filePath(fileId), req.file.buffer);
    saveMeta(fileId, {
      originalName: req.file.originalname,
      sheetName: resolvedSheet,
      createdAt: Date.now(),
      processed: false,
    });

    fileStore.set(fileId, {
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      sheetName: resolvedSheet,
      createdAt: Date.now(),
    });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const preview = getSheetPreviewFromWorkbook(workbook, resolvedSheet, startRow, endRow);

    res.json({
      success: true,
      fileId,
      rowCount: queue.length,
      sheetName: resolvedSheet,
      sheetNames,
      preview,
    });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/process', async (req, res) => {
  const { fileId, sheetName, startRow, endRow } = req.body;
  if (!fileId) return res.status(400).json({ error: 'fileId is required' });

  const entry = ensureBuffer(fileId);
  if (!entry) return res.status(404).json({ error: 'File not found. Please re-upload.' });

  const sheet = sheetName || entry.sheetName;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  try {
    const { crawlDomain, normalizeUrl } = require('../lib/crawler');
    const { selectBestResults } = require('../lib/extractor');
    const { verifyEmail } = require('../lib/email-verifier');

    const ROW_CONCURRENCY = 3;

    const { queue } = parseExcelFile(entry.buffer, sheet, startRow, endRow);
    const total = queue.length;
    const allResults = [];

    const existingProgress = loadProgress(fileId);
    const alreadyDone = Object.keys(existingProgress).length;

    res.write(`data: ${JSON.stringify({ type: 'start', total, resumedFrom: alreadyDone })}\n\n`);

    let processedCount = 0;
    const domainCache = new Map();

    async function processRow(item) {
      const { rowIndex, url } = item;

      if (existingProgress[rowIndex] !== undefined) {
        processedCount++;
        allResults.push(existingProgress[rowIndex]);
        const found = allResults.filter(r => r.email).length;
        res.write(`data: ${JSON.stringify({
          type: 'result',
          rowIndex,
          url,
          ...existingProgress[rowIndex],
          skipped: true,
          stats: { processed: processedCount, found, total }
        })}\n\n`);
        return;
      }

      res.write(`data: ${JSON.stringify({ type: 'progress', current: processedCount + 1, total, url, rowIndex })}\n\n`);

      try {
        let cacheKey;
        try {
          const u = new URL(normalizeUrl(url));
          cacheKey = u.hostname.replace(/^www\./, '');
        } catch { cacheKey = url; }
        let result;
        if (domainCache.has(cacheKey)) {
          result = await domainCache.get(cacheKey);
        } else {
          const crawlPromise = crawlDomain(url);
          domainCache.set(cacheKey, crawlPromise);
          result = await crawlPromise;
        }
        const best = selectBestResults(result);

        let verificationStatus = '';
        let verificationScore = null;
        let verificationDetail = '';
        if (best.email) {
          try {
            const v = await verifyEmail(best.email);
            verificationScore = v.score != null ? v.score : 0;
            const rating = verificationScore >= 80 ? 'Safe to Send' : verificationScore >= 50 ? 'Risky' : 'Unsafe';
            verificationStatus = `${rating} (${verificationScore}%)`;
            verificationDetail = `${v.status || 'unknown'} | Score: ${verificationScore}% | ${rating}`;
          } catch (e) {}
        }

        const rowResult = {
          rowIndex,
          name: best.name,
          email: best.email,
          contactEmail: best.contactEmail,
          verificationStatus,
        };

        allResults.push(rowResult);
        existingProgress[rowIndex] = rowResult;
        saveProgress(fileId, existingProgress);

        await saveLeadFromExcel(url, best.name, best.email, best.contactEmail, verificationStatus, verificationScore);

        processedCount++;
        const found = allResults.filter(r => r.email).length;

        res.write(`data: ${JSON.stringify({
          type: 'result',
          rowIndex,
          url,
          name: best.name,
          email: best.email,
          contactEmail: best.contactEmail,
          verificationStatus,
          verificationScore,
          verificationDetail,
          stats: { processed: processedCount, found, total }
        })}\n\n`);
      } catch (e) {
        const rowResult = { rowIndex, name: '', email: '', contactEmail: '', verificationStatus: 'Error' };
        allResults.push(rowResult);
        existingProgress[rowIndex] = rowResult;
        saveProgress(fileId, existingProgress);

        processedCount++;
        res.write(`data: ${JSON.stringify({
          type: 'error',
          rowIndex,
          url,
          error: e.message,
          stats: { processed: processedCount, found: allResults.filter(r => r.email).length, total }
        })}\n\n`);
      }
    }

    let idx = 0;
    async function runWorker() {
      while (idx < queue.length) {
        const item = queue[idx++];
        try {
          await processRow(item);
        } catch (e) {
          console.error('Worker error on row', item.rowIndex, ':', e.message);
        }
      }
    }

    const workers = [];
    for (let w = 0; w < Math.min(ROW_CONCURRENCY, queue.length); w++) {
      workers.push(runWorker());
    }
    await Promise.all(workers);

    const updatedBuffer = writeResultsToExcel(entry.buffer, sheet, allResults);
    entry.buffer = updatedBuffer;
    entry.processed = true;
    fs.writeFileSync(filePath(fileId), updatedBuffer);
    saveMeta(fileId, {
      originalName: entry.originalName,
      sheetName: entry.sheetName,
      createdAt: entry.createdAt,
      processed: true,
    });

    const found = allResults.filter(r => r.email).length;
    res.write(`data: ${JSON.stringify({ type: 'complete', fileId, stats: { processed: total, found, total } })}\n\n`);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
  }

  res.end();
});

router.get('/session/:fileId', (req, res) => {
  const { fileId } = req.params;
  const rawEntry = fileStore.get(fileId);
  if (!rawEntry) return res.status(404).json({ exists: false });

  const progress = loadProgress(fileId);
  const doneCount = Object.keys(progress).length;

  let totalRows = doneCount;
  try {
    const full = ensureBuffer(fileId);
    if (full) {
      const { queue } = parseExcelFile(full.buffer, rawEntry.sheetName);
      totalRows = queue.length;
    }
  } catch (e) {}

  res.json({
    exists: true,
    fileId,
    originalName: rawEntry.originalName,
    sheetName: rawEntry.sheetName,
    totalRows,
    doneCount,
  });
});

router.get('/download/:fileId', (req, res) => {
  const fid = req.params.fileId;
  const entry = ensureBuffer(fid);
  if (!entry) return res.status(404).json({ error: 'File not found or expired' });

  const progress = loadProgress(fid);
  const progressResults = Object.values(progress);
  let outBuffer = entry.buffer;
  if (progressResults.length > 0) {
    try {
      outBuffer = writeResultsToExcel(entry.buffer, entry.sheetName, progressResults);
    } catch (e) {}
  }

  const filename = entry.originalName
    ? entry.originalName.replace(/\.xlsx?$/i, '') + '_results.xlsx'
    : 'results.xlsx';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(outBuffer);
});

module.exports = router;
