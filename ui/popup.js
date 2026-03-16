document.addEventListener('DOMContentLoaded', () => {
    const isChromeExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    const singleUrlInput = document.getElementById('singleUrl');
    const scanBtn = document.getElementById('scanBtn');
    const spreadsheetIdInput = document.getElementById('spreadsheetId');
    const sheetNameInput = document.getElementById('sheetName');
    const authBtn = document.getElementById('authBtn');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const bulkDomainsInput = document.getElementById('bulkDomains');
    const bulkStartBtn = document.getElementById('bulkStartBtn');
    const bulkProgressContainer = document.getElementById('bulkProgressContainer');
    const bulkProgress = document.getElementById('bulkProgress');
    const bulkProgressText = document.getElementById('bulkProgressText');
    const statusText = document.getElementById('statusText');
    const processedCount = document.getElementById('processedCount');
    const foundCount = document.getElementById('foundCount');
    const spinner = document.getElementById('spinner');
    const emailCountBadge = document.getElementById('emailCount');
    const logsDiv = document.getElementById('logs');
    const resultsSection = document.getElementById('resultsSection');
    const resultsBody = document.getElementById('resultsBody');
    const copyBtn = document.getElementById('copyBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');

    let allResults = [];
    let isAuthorized = false;

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        });
    });

    if (isChromeExtension) {
        chrome.storage.local.get(['spreadsheetId', 'sheetName', 'isRunning', 'stats'], (result) => {
            if (result.spreadsheetId) spreadsheetIdInput.value = result.spreadsheetId;
            if (result.sheetName) sheetNameInput.value = result.sheetName;
            if (result.stats) {
                processedCount.innerText = result.stats.processed || 0;
                foundCount.innerText = result.stats.found || 0;
            }

            chrome.identity.getAuthToken({ 'interactive': false }, function(token) {
                if (token) {
                    authBtn.innerText = 'Authorized ✓';
                    authBtn.disabled = true;
                    startBtn.disabled = false;
                    isAuthorized = true;
                }
            });

            if (result.isRunning) {
                setRunningState(true);
            }
        });
    } else {
        log('Preview mode — Chrome extension APIs not available. Load as unpacked extension in Chrome for full functionality.', 'info');
    }

    function log(message, type = 'info') {
        const div = document.createElement('div');
        div.className = 'log-entry log-' + type;
        div.innerText = '[' + new Date().toLocaleTimeString() + '] ' + message;
        logsDiv.prepend(div);
    }

    function showSpinner(show) {
        spinner.classList.toggle('hidden', !show);
    }

    function updateEmailCount() {
        let total = 0;
        allResults.forEach(r => { if (r.email) total++; });
        emailCountBadge.innerText = total + ' email' + (total !== 1 ? 's' : '');
    }

    function addResult(result) {
        const existing = allResults.find(r => r.domain === result.domain);
        if (existing) {
            if (result.name) existing.name = result.name;
            if (result.email) existing.email = result.email;
            if (result.contactEmail) existing.contactEmail = result.contactEmail;
        } else {
            allResults.push(result);
        }
        renderResults();
        updateEmailCount();
    }

    function renderResults() {
        if (allResults.length === 0) {
            resultsSection.style.display = 'none';
            return;
        }
        resultsSection.style.display = '';
        resultsBody.innerHTML = '';
        allResults.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + escapeHtml(r.domain || '') + '</td><td>' + escapeHtml(r.name || '—') + '</td><td>' + escapeHtml(r.email || '—') + '</td><td>' + escapeHtml(r.contactEmail || '—') + '</td>';
            resultsBody.appendChild(tr);
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    scanBtn.addEventListener('click', () => {
        const url = singleUrlInput.value.trim();
        if (!url) {
            log('Please enter a URL', 'error');
            return;
        }
        if (!isChromeExtension) {
            log('Scanning requires Chrome extension context', 'error');
            return;
        }
        log('Scanning ' + url + '...', 'info');
        showSpinner(true);
        scanBtn.disabled = true;
        chrome.runtime.sendMessage({ action: 'SCAN_SINGLE', url: url }, (response) => {
            showSpinner(false);
            scanBtn.disabled = false;
            if (response && response.success) {
                log('Scan complete for ' + url, 'success');
                addResult(response.data);
            } else {
                log('Scan failed: ' + (response ? response.error : 'Unknown error'), 'error');
            }
        });
    });

    authBtn.addEventListener('click', () => {
        if (!isChromeExtension) {
            log('Authorization requires Chrome extension context', 'error');
            return;
        }
        log('Requesting authorization...', 'info');
        chrome.runtime.sendMessage({ action: 'AUTH' }, (response) => {
            if (response && response.success) {
                log('Authorization successful!', 'success');
                authBtn.innerText = 'Authorized ✓';
                authBtn.disabled = true;
                startBtn.disabled = false;
                isAuthorized = true;
            } else {
                log('Authorization failed: ' + (response ? response.error : 'Unknown error'), 'error');
            }
        });
    });

    startBtn.addEventListener('click', () => {
        if (!isChromeExtension) {
            log('Starting requires Chrome extension context', 'error');
            return;
        }
        const spreadsheetId = spreadsheetIdInput.value.trim();
        const sheetName = sheetNameInput.value.trim();
        if (!spreadsheetId) {
            log('Please enter a valid Spreadsheet ID', 'error');
            return;
        }
        chrome.storage.local.set({ spreadsheetId, sheetName });
        log('Starting extraction process...', 'info');
        setRunningState(true);
        chrome.runtime.sendMessage({ action: 'START', spreadsheetId, sheetName });
    });

    stopBtn.addEventListener('click', () => {
        if (!isChromeExtension) return;
        log('Stopping process...', 'info');
        setRunningState(false);
        chrome.runtime.sendMessage({ action: 'STOP' });
    });

    bulkStartBtn.addEventListener('click', () => {
        if (!isChromeExtension) {
            log('Bulk scanning requires Chrome extension context', 'error');
            return;
        }
        const text = bulkDomainsInput.value.trim();
        if (!text) {
            log('Please enter at least one domain', 'error');
            return;
        }
        const domains = text.split('\n').map(d => d.trim()).filter(d => d.length > 0);
        if (domains.length === 0) {
            log('No valid domains found', 'error');
            return;
        }
        log('Starting bulk scan of ' + domains.length + ' domains...', 'info');
        bulkStartBtn.disabled = true;
        bulkDomainsInput.disabled = true;
        bulkProgressContainer.style.display = '';
        bulkProgress.style.width = '0%';
        bulkProgressText.innerText = '0 / ' + domains.length;
        showSpinner(true);
        chrome.runtime.sendMessage({ action: 'BULK_START', domains: domains });
    });

    if (isChromeExtension) {
        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === 'LOG') {
                log(message.message, message.level);
            } else if (message.type === 'STATS') {
                processedCount.innerText = message.processed;
                foundCount.innerText = message.found;
            } else if (message.type === 'STATUS') {
                statusText.innerText = message.status;
                if (message.status === 'Idle' || message.status === 'Complete') {
                    setRunningState(false);
                    showSpinner(false);
                    bulkStartBtn.disabled = false;
                    bulkDomainsInput.disabled = false;
                }
            } else if (message.type === 'RESULT') {
                addResult(message.data);
            } else if (message.type === 'BULK_PROGRESS') {
                const pct = Math.round((message.current / message.total) * 100);
                bulkProgress.style.width = pct + '%';
                bulkProgressText.innerText = message.current + ' / ' + message.total;
            }
        });
    }

    copyBtn.addEventListener('click', () => {
        if (allResults.length === 0) return;
        const lines = [];
        allResults.forEach(r => {
            if (r.email) lines.push(r.email);
            if (r.contactEmail && r.contactEmail !== r.email) lines.push(r.contactEmail);
        });
        const text = [...new Set(lines)].join('\n');
        navigator.clipboard.writeText(text).then(() => {
            log('Emails copied to clipboard!', 'success');
            copyBtn.innerText = '✅';
            setTimeout(() => { copyBtn.innerText = '📋'; }, 1500);
        }).catch(() => {
            log('Failed to copy to clipboard', 'error');
        });
    });

    exportCsvBtn.addEventListener('click', () => {
        if (allResults.length === 0) return;
        const rows = [['Domain', 'Name', 'Email', 'Contact']];
        allResults.forEach(r => {
            rows.push([
                r.domain || '',
                r.name || '',
                r.email || '',
                r.contactEmail || ''
            ]);
        });
        const csv = rows.map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'leads_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        URL.revokeObjectURL(url);
        log('CSV exported!', 'success');
    });

    function setRunningState(isRunning) {
        showSpinner(isRunning);
        if (isRunning) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            spreadsheetIdInput.disabled = true;
            sheetNameInput.disabled = true;
            statusText.innerText = 'Running...';
        } else {
            startBtn.disabled = !isAuthorized;
            stopBtn.disabled = true;
            spreadsheetIdInput.disabled = false;
            sheetNameInput.disabled = false;
        }
    }
});
