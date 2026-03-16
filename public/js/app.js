const allResults = [];

function addResult(data) {
  allResults.push(data);
  addToResultsTable(data);
  addToDashboard(data);
  updateBadge();
  updateDashStats();
}

async function loadLeadsFromServer() {
  try {
    const resp = await fetch('/api/leads');
    const json = await resp.json();
    if (json.success && Array.isArray(json.leads)) {
      allResults.length = 0;
      json.leads.forEach(lead => allResults.push(lead));
      rebuildDashboard();
    } else {
      console.error('Failed to load leads:', json.error);
    }
  } catch (e) {
    console.error('Could not reach leads API:', e.message);
  }
}

async function deleteLead(id, rowEl) {
  try {
    const resp = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    const json = await resp.json();
    if (json.success) {
      const idx = allResults.findIndex(r => r.id === id);
      if (idx !== -1) allResults.splice(idx, 1);
      if (rowEl) rowEl.remove();
      const dashRow = document.querySelector(`#dashBody tr[data-lead-id="${id}"]`);
      if (dashRow) dashRow.remove();
      const resultsRow = document.querySelector(`#resultsBody tr[data-lead-id="${id}"]`);
      if (resultsRow) resultsRow.remove();
      updateBadge();
      updateDashStats();
    }
  } catch (e) {}
}

let sessionRestored = false;
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'excel' && !sessionRestored) {
      sessionRestored = true;
      tryRestoreSession();
    }
  });
});

function updateBadge() {
  document.getElementById('totalBadge').textContent = allResults.length + ' leads';
}

function getLeadVerification(data) {
  const v = data.verifications ? (data.verifications[data.email] || null) : null;
  if (v) return v;
  if (data.verificationScore != null) {
    return { score: data.verificationScore, status: data.verificationStatus || '', mxRecords: data.mxRecords || [] };
  }
  return null;
}

function getSendRating(verification) {
  if (!verification) return { rating: 'Unknown', cls: 'unknown', score: null };
  const score = verification.score;
  if (score == null) return { rating: 'Unknown', cls: 'unknown', score: null };
  if (score >= 80) return { rating: 'Safe to Send', cls: 'safe', score };
  if (score >= 50) return { rating: 'Risky', cls: 'risky', score };
  return { rating: 'Unsafe', cls: 'unsafe', score };
}

function getMailVerifierHtml(verification) {
  if (!verification) return '<span class="verify-badge unknown">Not Verified</span>';
  const { rating, cls, score } = getSendRating(verification);
  const scoreText = score != null ? `${score}%` : '';
  const status = verification.status || '';
  const statusLabel = status.replace(/_/g, ' ');

  let html = `<div class="verify-cell">`;
  html += `<span class="verify-badge ${cls}">${rating}</span>`;
  if (scoreText) {
    const barColor = cls === 'safe' ? 'var(--success)' : cls === 'risky' ? 'var(--warning)' : 'var(--danger)';
    html += `<div class="score-bar"><div class="score-fill"><div class="score-fill-inner" style="width:${score}%;background:${barColor}"></div></div><span class="score-text">${scoreText}</span></div>`;
  }
  if (statusLabel) {
    html += `<div class="verify-status">${statusLabel}</div>`;
  }
  html += `</div>`;
  return html;
}

function getVerificationBadge(verification) {
  return getMailVerifierHtml(verification);
}

function formatMxRecords(verification) {
  if (!verification || !verification.mxRecords || verification.mxRecords.length === 0) {
    return '<span class="mx-records">N/A</span>';
  }
  return '<div class="mx-records">' +
    verification.mxRecords.slice(0, 3).map(mx =>
      `<div class="mx-entry">${mx.priority} ${mx.host}</div>`
    ).join('') +
    (verification.mxRecords.length > 3 ? `<div class="mx-entry">+${verification.mxRecords.length - 3} more</div>` : '') +
    '</div>';
}

function extractDomainFromUrl(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '');
  } catch (e) {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

function extractNameOnly(nameWithRole) {
  if (!nameWithRole) return '';
  return nameWithRole.replace(/\s*\(.*?\)\s*$/, '').trim();
}

function extractRole(nameWithRole) {
  if (!nameWithRole) return '';
  const m = nameWithRole.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : '';
}

function getFbPageUrl(socialLinks) {
  if (!socialLinks || !Array.isArray(socialLinks)) return '';
  for (const link of socialLinks) {
    if (link.includes('facebook.com')) return link;
  }
  return '';
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isSafeHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function isFacebookPageUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') &&
      (u.hostname === 'facebook.com' || u.hostname.endsWith('.facebook.com'));
  } catch (e) {
    return false;
  }
}

function buildLookupButtons(data) {
  const domain = extractDomainFromUrl(data.domain || '');
  const name = extractNameOnly(data.name);
  const role = extractRole(data.name);
  const fbPage = getFbPageUrl(data.socialLinks);

  if (!name && !domain) return '';

  let html = '<span class="lookup-buttons">';

  if (name) {
    const liQuery = encodeURIComponent(name + ' ' + domain);
    html += `<a href="https://www.linkedin.com/search/results/people/?keywords=${liQuery}" target="_blank" rel="noopener" class="lookup-btn lookup-linkedin" title="${escapeAttr('Search LinkedIn for ' + name)}">in</a>`;
  }

  if (domain) {
    const urlEncoded = escapeAttr(data.domain || '');
    html += `<button class="lookup-btn lookup-google" data-url="${urlEncoded}" title="Auto-lookup name from web search">G</button>`;
  }

  if (fbPage && isFacebookPageUrl(fbPage)) {
    html += `<a href="${escapeAttr(fbPage)}" target="_blank" rel="noopener" class="lookup-btn lookup-fb" title="Open Facebook Page">f</a>`;
  }

  html += '</span>';
  return html;
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.lookup-google');
  if (!btn) return;

  const url = btn.dataset.url;
  if (!url) return;

  const nameCellText = btn.closest('td,div.item-value')?.querySelector('.lead-name-text');

  btn.disabled = true;
  btn.textContent = '…';

  try {
    const res = await fetch('/api/lookup/name?' + new URLSearchParams({ url }));
    const data = await res.json();

    if (data.name && data.name.length > 1) {
      btn.textContent = '✓';
      btn.title = 'Found: ' + data.name;
      if (nameCellText) {
        nameCellText.textContent = data.name;
        nameCellText.title = data.name;
      }
      setTimeout(() => { btn.textContent = 'G'; btn.disabled = false; }, 2000);
    } else {
      btn.textContent = '?';
      btn.title = 'Name not found';
      setTimeout(() => { btn.textContent = 'G'; btn.disabled = false; }, 2000);
    }
  } catch (err) {
    btn.textContent = '!';
    btn.title = 'Lookup failed';
    setTimeout(() => { btn.textContent = 'G'; btn.disabled = false; }, 2000);
  }
});

function renderResultCard(data) {
  const v = getLeadVerification(data);

  let peopleHtml = '';
  if (data.people && data.people.length > 0) {
    peopleHtml = '<div class="people-list">' +
      data.people.map(p => `<span class="person-tag">${p.name} (${p.role})${p.email ? ' - ' + p.email : ''}</span>`).join('') +
      '</div>';
  }

  let socialHtml = '';
  if (data.socialLinks && data.socialLinks.length > 0) {
    socialHtml = '<div class="social-links">' +
      data.socialLinks.map(l => {
        const domain = new URL(l).hostname.replace('www.', '');
        return `<a href="${l}" target="_blank">${domain}</a>`;
      }).join('') +
      '</div>';
  }

  return `<div class="result-card">
    <div class="domain">${data.domain}</div>
    <div class="result-grid">
      <div class="result-item">
        <div class="item-label">Person</div>
        <div class="item-value"><span class="lead-name-text">${data.name || ''}</span> ${buildLookupButtons(data)}</div>
      </div>
      <div class="result-item">
        <div class="item-label">Email</div>
        <div class="item-value">${data.email || 'Not found'}</div>
      </div>
      <div class="result-item">
        <div class="item-label">Mail Verifier</div>
        <div class="item-value">${getMailVerifierHtml(v)}</div>
      </div>
      <div class="result-item">
        <div class="item-label">Contact</div>
        <div class="item-value">${data.contactEmail || 'N/A'}</div>
      </div>
      <div class="result-item">
        <div class="item-label">MX Records</div>
        <div class="item-value">${formatMxRecords(v)}</div>
      </div>
      ${data.personalEmails && data.personalEmails.length > 0 ? `
      <div class="result-item">
        <div class="item-label">Personal Emails</div>
        <div class="item-value">${data.personalEmails.join(', ')}</div>
      </div>` : ''}
      ${data.companyEmails && data.companyEmails.length > 0 ? `
      <div class="result-item">
        <div class="item-label">Company Emails</div>
        <div class="item-value">${data.companyEmails.join(', ')}</div>
      </div>` : ''}
    </div>
    ${peopleHtml}
    ${socialHtml}
  </div>`;
}

function makeDeleteBtn(id) {
  return `<button class="delete-lead-btn" data-id="${id}" title="Delete lead">&#x2715;</button>`;
}

function addToResultsTable(data) {
  const v = getLeadVerification(data);
  const tbody = document.getElementById('resultsBody');
  const tr = document.createElement('tr');
  if (data.id) tr.dataset.leadId = data.id;
  tr.innerHTML = `
    <td title="${data.domain}">${data.domain}</td>
    <td><span class="lead-name-text" title="${escapeAttr(data.name || '')}">${data.name || ''}</span> ${buildLookupButtons(data)}</td>
    <td title="${data.email || ''}">${data.email || '-'}</td>
    <td>${getMailVerifierHtml(v)}</td>
    <td title="${data.contactEmail || ''}">${data.contactEmail || '-'}</td>
    <td>${formatMxRecords(v)}</td>
    <td>${data.id ? makeDeleteBtn(data.id) : ''}</td>
  `;
  if (data.id) {
    tr.querySelector('.delete-lead-btn').addEventListener('click', () => deleteLead(data.id, tr));
  }
  tbody.appendChild(tr);
  document.getElementById('emptyState').classList.add('hidden');
}

function addToDashboard(data) {
  const v = getLeadVerification(data);
  const tbody = document.getElementById('dashBody');
  const tr = document.createElement('tr');
  if (data.id) tr.dataset.leadId = data.id;
  const dateStr = data.savedAt ? new Date(data.savedAt).toLocaleDateString() : '-';
  tr.innerHTML = `
    <td title="${data.domain}">${data.domain}</td>
    <td><span class="lead-name-text" title="${escapeAttr(data.name || '')}">${data.name || ''}</span> ${buildLookupButtons(data)}</td>
    <td title="${data.email || ''}">${data.email || '-'}</td>
    <td>${getMailVerifierHtml(v)}</td>
    <td title="${data.contactEmail || ''}">${data.contactEmail || '-'}</td>
    <td>${dateStr}</td>
    <td>${data.id ? makeDeleteBtn(data.id) : ''}</td>
  `;
  if (data.id) {
    tr.querySelector('.delete-lead-btn').addEventListener('click', () => deleteLead(data.id, tr));
  }
  tbody.insertBefore(tr, tbody.firstChild);
  document.getElementById('dashEmpty').classList.add('hidden');
}

function updateDashStats() {
  const total = allResults.length;
  let verified = 0, safe = 0, risky = 0;
  for (const data of allResults) {
    const v = getLeadVerification(data);
    if (v && v.score != null) {
      verified++;
      if (v.score >= 80) safe++;
      else if (v.score >= 50) risky++;
    }
  }
  document.getElementById('dashTotalLeads').textContent = total;
  document.getElementById('dashVerified').textContent = verified;
  document.getElementById('dashSafeToSend').textContent = safe;
  document.getElementById('dashRisky').textContent = risky;
}

function rebuildDashboard() {
  document.getElementById('dashBody').innerHTML = '';
  document.getElementById('resultsBody').innerHTML = '';
  for (const data of allResults) {
    addToResultsTable(data);
    addToDashboard(data);
  }
  if (allResults.length > 0) {
    document.getElementById('dashEmpty').classList.add('hidden');
    document.getElementById('emptyState').classList.add('hidden');
  }
  updateDashStats();
  updateBadge();
}

loadLeadsFromServer();

document.getElementById('scanBtn').addEventListener('click', async () => {
  const url = document.getElementById('singleUrl').value.trim();
  if (!url) return;

  const btn = document.getElementById('scanBtn');
  const statusEl = document.getElementById('singleStatus');
  const resultEl = document.getElementById('singleResult');

  btn.disabled = true;
  btn.textContent = 'Scanning...';
  statusEl.classList.remove('hidden');
  resultEl.classList.add('hidden');
  document.getElementById('singleStatusText').textContent = 'Scanning...';
  document.getElementById('singleProgress').style.width = '30%';

  try {
    const resp = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const json = await resp.json();

    document.getElementById('singleProgress').style.width = '100%';

    if (json.success) {
      document.getElementById('singleStatusText').textContent = 'Complete';
      resultEl.classList.remove('hidden');
      document.getElementById('singleResultContent').innerHTML = renderResultCard(json.data);
      addResult(json.data);
    } else {
      document.getElementById('singleStatusText').textContent = 'Error: ' + json.error;
    }
  } catch (e) {
    document.getElementById('singleStatusText').textContent = 'Error: ' + e.message;
  }

  btn.disabled = false;
  btn.textContent = 'Scan';
});

let bulkAbort = null;

document.getElementById('bulkScanBtn').addEventListener('click', async () => {
  const text = document.getElementById('bulkDomains').value.trim();
  if (!text) return;

  const domains = text.split('\n').map(d => d.trim()).filter(Boolean);
  if (domains.length === 0) return;

  const statusEl = document.getElementById('bulkStatus');
  const resultsEl = document.getElementById('bulkResults');
  const stopBtn = document.getElementById('bulkStopBtn');
  const scanBtn = document.getElementById('bulkScanBtn');

  statusEl.classList.remove('hidden');
  stopBtn.classList.remove('hidden');
  scanBtn.disabled = true;
  resultsEl.innerHTML = '';

  bulkAbort = new AbortController();

  try {
    const resp = await fetch('/api/bulk-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains }),
      signal: bulkAbort.signal,
    });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));

          if (event.type === 'progress') {
            const pct = ((event.current / event.total) * 100).toFixed(0);
            document.getElementById('bulkProgress').style.width = pct + '%';
            document.getElementById('bulkStatusText').textContent = `${event.current} / ${event.total}`;
          }

          if (event.type === 'result') {
            document.getElementById('bulkProcessed').textContent = event.stats.processed;
            document.getElementById('bulkFound').textContent = event.stats.found;
            resultsEl.innerHTML += renderResultCard(event.data);
            addResult(event.data);
          }

          if (event.type === 'complete') {
            document.getElementById('bulkProgress').style.width = '100%';
            document.getElementById('bulkStatusText').textContent = 'Complete';
            document.getElementById('bulkProcessed').textContent = event.stats.processed;
            document.getElementById('bulkFound').textContent = event.stats.found;
          }

          if (event.type === 'error') {
            document.getElementById('bulkProcessed').textContent = event.stats.processed;
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      document.getElementById('bulkStatusText').textContent = 'Error: ' + e.message;
    }
  }

  scanBtn.disabled = false;
  stopBtn.classList.add('hidden');
});

document.getElementById('bulkStopBtn').addEventListener('click', () => {
  if (bulkAbort) bulkAbort.abort();
  document.getElementById('bulkStatusText').textContent = 'Stopped';
  document.getElementById('bulkStopBtn').classList.add('hidden');
  document.getElementById('bulkScanBtn').disabled = false;
});

let selectedFile = null;
let currentFileId = null;

function saveSession(data) {
  try { localStorage.setItem('leadExtractorSession', JSON.stringify(data)); } catch (e) {}
}
function clearSession() {
  try { localStorage.removeItem('leadExtractorSession'); } catch (e) {}
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem('leadExtractorSession') || 'null'); } catch (e) { return null; }
}

async function tryRestoreSession() {
  const session = loadSession();
  if (!session || !session.fileId) return;
  try {
    const resp = await fetch(`/api/excel/session/${session.fileId}`);
    if (!resp.ok) { clearSession(); return; }
    const data = await resp.json();
    if (!data.exists) { clearSession(); return; }

    currentFileId = data.fileId;
    document.getElementById('uploadContent').classList.add('hidden');
    document.getElementById('uploadSuccess').classList.remove('hidden');
    document.getElementById('uploadFilename').textContent = data.originalName || 'Previous file';
    document.getElementById('excelSheetName').value = data.sheetName || '';
    document.getElementById('excelProcessBtn').disabled = false;

    const info = document.getElementById('excelRowInfo');
    info.classList.remove('hidden');
    const remaining = data.totalRows - data.doneCount;
    if (data.doneCount > 0) {
      info.innerHTML = `<strong>Resuming previous session:</strong> ${data.doneCount} rows already done, ${remaining} remaining in sheet "${data.sheetName}".`;
      document.getElementById('excelDownloadCard').classList.remove('hidden');
    } else {
      info.textContent = `Found ${data.totalRows} rows to process in sheet "${data.sheetName}".`;
    }
  } catch (e) { clearSession(); }
}

const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');

uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) {
    handleFileSelect(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    handleFileSelect(fileInput.files[0]);
  }
});

function handleFileSelect(file) {
  if (!file.name.match(/\.xlsx?$/i)) {
    alert('Please select an .xlsx or .xls file');
    return;
  }
  selectedFile = file;
  document.getElementById('uploadContent').classList.add('hidden');
  document.getElementById('uploadSuccess').classList.remove('hidden');
  document.getElementById('uploadFilename').textContent = file.name;
  document.getElementById('excelProcessBtn').disabled = true;
  currentFileId = null;
  document.getElementById('excelRowInfo').classList.add('hidden');
  document.getElementById('excelDownloadCard').classList.add('hidden');
  document.getElementById('excelPreviewCard').classList.add('hidden');
  document.getElementById('excelStatus').classList.add('hidden');
}

document.getElementById('removeFileBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  selectedFile = null;
  currentFileId = null;
  fileInput.value = '';
  clearSession();
  sessionRestored = false;
  document.getElementById('uploadContent').classList.remove('hidden');
  document.getElementById('uploadSuccess').classList.add('hidden');
  document.getElementById('excelProcessBtn').disabled = true;
  document.getElementById('excelRowInfo').classList.add('hidden');
  document.getElementById('excelDownloadCard').classList.add('hidden');
  document.getElementById('excelPreviewCard').classList.add('hidden');
});

const WRITE_COLS = { H: 7, I: 8, J: 9, L: 11 };

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderExcelPreview(preview, toProcessCount) {
  const card = document.getElementById('excelPreviewCard');
  const thead = document.getElementById('excelPreviewHead');
  const tbody = document.getElementById('excelPreviewBody');
  const countEl = document.getElementById('previewCount');

  card.classList.remove('hidden');
  const total = preview.totalRows != null ? preview.totalRows : preview.rows.length;
  countEl.textContent = `${total} rows total, ${toProcessCount} to process`;

  let headerHtml = '<tr><th class="row-number">#</th>';
  preview.headers.forEach((h, i) => {
    const letter = preview.colLetters ? preview.colLetters[i] : '';
    const cls = ['H','I','J','L'].includes(letter) ? ' col-' + letter.toLowerCase() : '';
    headerHtml += `<th class="${cls}" title="Column ${escapeHtml(letter)}">${escapeHtml(letter)}: ${escapeHtml(h)}</th>`;
  });
  headerHtml += '</tr>';
  thead.innerHTML = headerHtml;

  let bodyHtml = '';
  preview.rows.forEach(row => {
    const emailIdx = preview.colLetters ? preview.colLetters.indexOf('I') : 8;
    const urlIdx = preview.colLetters ? preview.colLetters.indexOf('C') : 2;
    const emailVal = emailIdx >= 0 && row.cells[emailIdx] ? row.cells[emailIdx].trim() : '';
    const urlVal = urlIdx >= 0 && row.cells[urlIdx] ? row.cells[urlIdx].trim() : '';
    const hasEmail = emailVal.length > 2 && emailVal.toLowerCase() !== 'not found';
    const rowClass = (urlVal && hasEmail) ? 'row-skipped' : '';

    bodyHtml += `<tr class="${rowClass}" data-row="${row.rowIndex}">`;
    bodyHtml += `<td class="row-number">${row.rowIndex}</td>`;
    row.cells.forEach((cell, i) => {
      const letter = preview.colLetters ? preview.colLetters[i] : '';
      const cls = ['H','I','J','L'].includes(letter) ? ' col-' + letter.toLowerCase() : '';
      const cellId = `cell-${row.rowIndex}-${letter}`;
      bodyHtml += `<td class="${cls}" id="${cellId}" title="${escapeHtml(cell)}">${escapeHtml(cell)}</td>`;
    });
    bodyHtml += '</tr>';
  });
  tbody.innerHTML = bodyHtml;
}

function updatePreviewRow(rowIndex, data) {
  const tr = document.querySelector(`#excelPreviewBody tr[data-row="${rowIndex}"]`);
  if (!tr) return;

  tr.classList.remove('row-processing');

  const updates = { H: data.name, I: data.email || 'Not Found', J: data.contactEmail, L: data.verificationStatus };
  for (const [col, value] of Object.entries(updates)) {
    if (!value) continue;
    const td = document.getElementById(`cell-${rowIndex}-${col}`);
    if (td) {
      td.textContent = value;
      td.title = value;
      td.classList.add('cell-updated');
    }
  }
}

function highlightPreviewRow(rowIndex) {
  const prev = document.querySelector('#excelPreviewBody tr.row-processing');
  if (prev) prev.classList.remove('row-processing');

  const tr = document.querySelector(`#excelPreviewBody tr[data-row="${rowIndex}"]`);
  if (tr) {
    tr.classList.add('row-processing');
    tr.scrollIntoView({ block: 'nearest' });
  }
}

document.getElementById('excelUploadBtn').addEventListener('click', async () => {
  if (!selectedFile) return alert('Please select a file first');

  const btn = document.getElementById('excelUploadBtn');
  btn.disabled = true;
  btn.textContent = 'Checking...';

  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('sheetName', document.getElementById('excelSheetName').value.trim());

  try {
    const resp = await fetch('/api/excel/upload', { method: 'POST', body: formData });
    const json = await resp.json();

    if (json.success) {
      currentFileId = json.fileId;
      saveSession({ fileId: json.fileId, fileName: selectedFile.name, sheetName: json.sheetName, rowCount: json.rowCount });

      const info = document.getElementById('excelRowInfo');
      info.classList.remove('hidden');
      info.textContent = `Found ${json.rowCount} rows to process in sheet "${json.sheetName}". Available sheets: ${json.sheetNames.join(', ')}`;
      document.getElementById('excelProcessBtn').disabled = false;

      if (document.getElementById('excelSheetName').value.trim() === '') {
        document.getElementById('excelSheetName').value = json.sheetName;
      }

      if (json.preview) {
        renderExcelPreview(json.preview, json.rowCount);
      }
    } else {
      alert('Error: ' + json.error);
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }

  btn.disabled = false;
  btn.textContent = 'Check Rows';
});

document.getElementById('excelProcessBtn').addEventListener('click', async () => {
  if (!currentFileId) return alert('Please upload and check rows first');

  const sheetName = document.getElementById('excelSheetName').value.trim();
  const statusEl = document.getElementById('excelStatus');
  const logEl = document.getElementById('excelLog');
  const downloadCard = document.getElementById('excelDownloadCard');

  statusEl.classList.remove('hidden');
  logEl.classList.remove('hidden');
  downloadCard.classList.remove('hidden');
  logEl.innerHTML = '';

  document.getElementById('excelProcessBtn').disabled = true;

  function addLog(msg, cls) {
    const d = document.createElement('div');
    d.className = cls || '';
    d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
  }

  addLog('Starting batch processing...');

  try {
    const resp = await fetch('/api/excel/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: currentFileId, sheetName }),
    });

    if (!resp.ok) {
      const errJson = await resp.json().catch(() => ({ error: 'Server error' }));
      addLog('Error: ' + (errJson.error || 'Server error'), 'log-error');
      document.getElementById('excelProcessBtn').disabled = false;
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));

          if (event.type === 'start') {
            addLog(`Processing ${event.total} rows...`);
          }

          if (event.type === 'progress') {
            const pct = ((event.current / event.total) * 100).toFixed(0);
            document.getElementById('excelProgress').style.width = pct + '%';
            document.getElementById('excelStatusText').textContent = `${event.current} / ${event.total}`;
            addLog(`Scanning: ${event.url}`);
            highlightPreviewRow(event.rowIndex);
          }

          if (event.type === 'result') {
            document.getElementById('excelProcessed').textContent = event.stats.processed;
            document.getElementById('excelFound').textContent = event.stats.found;
            const status = event.verificationStatus ? ` [${event.verificationStatus}]` : '';
            addLog(`Row ${event.rowIndex}: ${event.email || 'No email'}${status}`, event.email ? 'log-success' : 'log-warn');
            updatePreviewRow(event.rowIndex, {
              name: event.name,
              email: event.email,
              contactEmail: event.contactEmail,
              verificationStatus: event.verificationStatus,
            });
          }

          if (event.type === 'error') {
            if (event.rowIndex) {
              addLog(`Row ${event.rowIndex} error: ${event.error}`, 'log-error');
              updatePreviewRow(event.rowIndex, { email: '', verificationStatus: 'Error' });
            } else {
              addLog(`Error: ${event.error}`, 'log-error');
            }
          }

          if (event.type === 'complete') {
            document.getElementById('excelProgress').style.width = '100%';
            document.getElementById('excelStatusText').textContent = 'Complete';
            document.getElementById('excelProcessed').textContent = event.stats.processed;
            document.getElementById('excelFound').textContent = event.stats.found;
            addLog(`Done! Processed ${event.stats.processed}, found ${event.stats.found} emails.`, 'log-success');

            const activeRow = document.querySelector('#excelPreviewBody tr.row-processing');
            if (activeRow) activeRow.classList.remove('row-processing');

            downloadCard.classList.remove('hidden');
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    addLog('Error: ' + e.message, 'log-error');
  }

  document.getElementById('excelProcessBtn').disabled = false;
});

document.getElementById('excelDownloadBtn').addEventListener('click', () => {
  if (!currentFileId) return alert('No processed file available');
  window.location.href = '/api/excel/download/' + currentFileId;
});

document.getElementById('filterInput').addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  const rows = document.querySelectorAll('#resultsBody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (allResults.length === 0) return alert('No results to export');
  exportCsv();
});

document.getElementById('dashExportBtn').addEventListener('click', () => {
  if (allResults.length === 0) return alert('No results to export');
  exportCsv();
});

function exportCsv() {
  let csv = 'Domain,Name,Email,Verification,Score,Send Rating,Contact,MX Records,Date\n';
  for (const r of allResults) {
    const v = r.verifications ? (r.verifications[r.email] || {}) : {};
    const mx = v.mxRecords ? v.mxRecords.map(m => m.host).join('; ') : '';
    const status = v.status || (v.valid ? 'Valid' : 'Unknown');
    const score = v.score != null ? v.score + '%' : '';
    const { rating } = getSendRating(v);
    const date = r.savedAt ? new Date(r.savedAt).toLocaleDateString() : '';
    csv += `"${r.domain}","${r.name || ''}","${r.email || ''}","${status}","${score}","${rating}","${r.contactEmail || ''}","${mx}","${date}"\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lead-extractor-results.csv';
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('copyAllBtn').addEventListener('click', () => {
  if (allResults.length === 0) return alert('No results to copy');

  const text = allResults.map(r =>
    `${r.domain}\t${r.name || ''}\t${r.email || ''}\t${r.contactEmail || ''}`
  ).join('\n');

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyAllBtn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy All', 2000);
  });
});

async function clearAllResults() {
  if (confirm('Clear all saved results? This cannot be undone.')) {
    const ids = allResults.map(r => r.id).filter(Boolean);
    allResults.length = 0;
    document.getElementById('resultsBody').innerHTML = '';
    document.getElementById('dashBody').innerHTML = '';
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('dashEmpty').classList.remove('hidden');
    updateBadge();
    updateDashStats();
    for (const id of ids) {
      try { await fetch(`/api/leads/${id}`, { method: 'DELETE' }); } catch (e) {}
    }
  }
}

document.getElementById('clearResultsBtn').addEventListener('click', clearAllResults);
document.getElementById('dashClearBtn').addEventListener('click', clearAllResults);

/* ─────────────────────────────────────────────────────
   EMAIL VERIFIER TAB
───────────────────────────────────────────────────── */

function getRating(score) {
  if (score >= 80) return 'safe';
  if (score >= 50) return 'risky';
  return 'unsafe';
}

function getRatingLabel(score) {
  if (score >= 80) return 'Safe to Send';
  if (score >= 50) return 'Risky';
  return 'Unsafe';
}

function formatStatus(status) {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function setCheck(id, state, detail) {
  const item = document.getElementById(id);
  if (!item) return;
  const icon = item.querySelector('.check-icon');
  const detailEl = item.querySelector('.check-detail');
  icon.className = 'check-icon ' + state;
  if (state === 'pass') icon.textContent = '✓';
  else if (state === 'fail') icon.textContent = '✗';
  else if (state === 'warn') icon.textContent = '!';
  else icon.textContent = '?';
  if (detailEl && detail) detailEl.textContent = detail;
}

function renderSingleVerifyResult(data) {
  const score = data.score || 0;
  const rating = getRating(score);

  const circle = document.getElementById('verifyScoreCircle');
  circle.className = 'verify-score-circle score-' + rating;
  document.getElementById('verifyScoreNum').textContent = score;
  document.getElementById('verifyEmailDisplay').textContent = data.email;

  const badge = document.getElementById('verifyRatingBadge');
  badge.className = 'verify-rating-badge ' + rating;
  badge.textContent = getRatingLabel(score);

  document.getElementById('verifyStatusText').textContent = formatStatus(data.status);

  const syntaxOk = data.status !== 'invalid_syntax';
  setCheck('chk-syntax', syntaxOk ? 'pass' : 'fail', syntaxOk ? 'Format is valid' : 'Invalid format');

  const notDisposable = !data.disposable;
  setCheck('chk-disposable', notDisposable ? 'pass' : 'fail', notDisposable ? 'Not a throwaway address' : 'Disposable domain detected');

  const domainExists = data.status !== 'domain_not_found';
  setCheck('chk-domain', domainExists ? 'pass' : 'fail', domainExists ? 'Domain resolves' : 'Domain not found');

  const hasMx = data.mxRecords && data.mxRecords.length > 0;
  setCheck('chk-mx', hasMx ? 'pass' : (data.status === 'no_mx_records' ? 'fail' : 'warn'),
    hasMx ? `${data.mxRecords.length} record(s) found` : 'No MX records found');

  let smtpState = 'warn', smtpDetail = 'Not checked';
  if (data.smtpCheck) {
    if (data.smtpCheck.success === true) { smtpState = 'pass'; smtpDetail = 'Mailbox accepted'; }
    else if (data.smtpCheck.reason === 'rejected') { smtpState = 'fail'; smtpDetail = 'Mailbox rejected'; }
    else { smtpState = 'warn'; smtpDetail = data.smtpCheck.reason || 'Inconclusive'; }
  } else if (data.status === 'invalid_syntax' || data.status === 'domain_not_found' || data.status === 'no_mx_records') {
    smtpState = 'fail'; smtpDetail = 'Skipped';
  }
  setCheck('chk-smtp', smtpState, smtpDetail);

  const mxList = document.getElementById('verifyMxList');
  if (hasMx) {
    mxList.innerHTML = data.mxRecords.map(mx =>
      `<div class="mx-row"><span><span class="mx-priority">${mx.priority}</span>${escapeHtml(mx.host)}</span></div>`
    ).join('');
  } else {
    mxList.innerHTML = '<div style="font-size:12px;color:var(--text-secondary)">No MX records found</div>';
  }

  const smtpDetail2 = document.getElementById('verifySmtpDetail');
  if (data.smtpCheck) {
    const s = data.smtpCheck;
    const resultVal = s.success === true ? 'accepted' : s.reason === 'rejected' ? 'rejected' : 'inconclusive';
    const resultClass = s.success === true ? 'accepted' : s.reason === 'rejected' ? 'rejected' : 'inconclusive';
    smtpDetail2.innerHTML = `
      <div class="smtp-row"><span class="smtp-key">Result</span><span class="smtp-val ${resultClass}">${resultVal}</span></div>
      ${s.banner ? `<div class="smtp-row"><span class="smtp-key">Banner</span><span class="smtp-val">${escapeHtml(s.banner).slice(0, 60)}</span></div>` : ''}
      ${s.reason ? `<div class="smtp-row"><span class="smtp-key">Reason</span><span class="smtp-val">${escapeHtml(s.reason)}</span></div>` : ''}
      ${s.code ? `<div class="smtp-row"><span class="smtp-key">Code</span><span class="smtp-val">${escapeHtml(String(s.code))}</span></div>` : ''}
    `;
  } else {
    smtpDetail2.innerHTML = '<div style="font-size:12px;color:var(--text-secondary)">SMTP check not performed</div>';
  }

  document.getElementById('verifyResult').classList.remove('hidden');
}

document.getElementById('verifyBtn').addEventListener('click', async () => {
  const email = document.getElementById('verifyEmail').value.trim();
  if (!email) return;

  const btn = document.getElementById('verifyBtn');
  btn.disabled = true;
  btn.textContent = 'Verifying…';
  document.getElementById('verifyResult').classList.add('hidden');

  try {
    const res = await fetch('/api/verify/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!res.ok) throw new Error('Server error: ' + res.status);
    const data = await res.json();
    renderSingleVerifyResult(data);
  } catch (err) {
    alert('Verification failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verify';
  }
});

document.getElementById('verifyEmail').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('verifyBtn').click();
});

let bulkVerifyAborted = false;

document.getElementById('bulkVerifyBtn').addEventListener('click', async () => {
  const raw = document.getElementById('bulkVerifyEmails').value;
  const emails = raw.split('\n').map(e => e.trim()).filter(Boolean);
  if (emails.length === 0) return;

  bulkVerifyAborted = false;
  const startBtn = document.getElementById('bulkVerifyBtn');
  const stopBtn = document.getElementById('bulkVerifyStopBtn');
  startBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');

  const statusCard = document.getElementById('bulkVerifyStatus');
  const tableWrap = document.getElementById('bulkVerifyTableWrap');
  const body = document.getElementById('bulkVerifyBody');
  statusCard.classList.remove('hidden');
  tableWrap.classList.remove('hidden');
  body.innerHTML = '';

  let checked = 0, safe = 0, risky = 0, unsafe = 0;

  const update = () => {
    const pct = Math.round((checked / emails.length) * 100);
    document.getElementById('bulkVerifyStatusText').textContent = `${checked} / ${emails.length}`;
    document.getElementById('bulkVerifyProgress').style.width = pct + '%';
    document.getElementById('bulkVerifyChecked').textContent = checked;
    document.getElementById('bulkVerifySafe').textContent = safe;
    document.getElementById('bulkVerifyRisky').textContent = risky;
    document.getElementById('bulkVerifyUnsafe').textContent = unsafe;
  };

  for (const email of emails) {
    if (bulkVerifyAborted) break;
    try {
      const res = await fetch('/api/verify/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      const score = data.score || 0;
      const rating = getRating(score);
      if (rating === 'safe') safe++;
      else if (rating === 'risky') risky++;
      else unsafe++;
      checked++;

      const hasMx = data.mxRecords && data.mxRecords.length > 0;
      const smtpResult = data.smtpCheck
        ? (data.smtpCheck.success === true ? '✓ Accepted' : data.smtpCheck.reason === 'rejected' ? '✗ Rejected' : '~ Inconclusive')
        : '—';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:monospace">${escapeHtml(data.email)}</td>
        <td><span class="bulk-verify-rating ${rating}">${getRatingLabel(score)}</span></td>
        <td><strong>${score}</strong></td>
        <td>${escapeHtml(formatStatus(data.status))}</td>
        <td>${hasMx ? data.mxRecords.length + ' record(s)' : '<span style="color:var(--text-secondary)">None</span>'}</td>
        <td>${escapeHtml(smtpResult)}</td>
        <td>${data.disposable ? '<span style="color:var(--danger)">Yes</span>' : '<span style="color:var(--success)">No</span>'}</td>
      `;
      body.appendChild(tr);
      update();
    } catch (err) {
      checked++;
      unsafe++;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td style="font-family:monospace">${escapeHtml(email)}</td><td><span class="bulk-verify-rating unsafe">Unsafe</span></td><td>0</td><td>Error: ${escapeHtml(err.message)}</td><td>—</td><td>—</td><td>—</td>`;
      body.appendChild(tr);
      update();
    }
  }

  startBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
});

document.getElementById('bulkVerifyStopBtn').addEventListener('click', () => {
  bulkVerifyAborted = true;
});

document.getElementById('bulkVerifyClearBtn').addEventListener('click', () => {
  document.getElementById('bulkVerifyEmails').value = '';
  document.getElementById('bulkVerifyStatus').classList.add('hidden');
  document.getElementById('bulkVerifyTableWrap').classList.add('hidden');
  document.getElementById('bulkVerifyBody').innerHTML = '';
});
