importScripts('extractor.js', 'crawler.js');

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const ALARM_NAME = 'process_batch_alarm';
const ALARM_PERIOD_MINUTES = 1 / 60;

function log(message, level = 'info') {
  console.log(`[${level.toUpperCase()}] ${message}`);
  chrome.runtime.sendMessage({ type: 'LOG', message, level }).catch(() => {});
}

async function getStoredState() {
  return await chrome.storage.local.get(['isRunning', 'queue', 'currentSpreadsheetId', 'currentSheetName', 'stats']);
}

async function updateState(newState) {
  await chrome.storage.local.set(newState);
  if (newState.stats) {
    chrome.runtime.sendMessage({ type: 'STATS', ...newState.stats }).catch(() => {});
  }
}

function setStatus(status) {
  chrome.runtime.sendMessage({ type: 'STATUS', status }).catch(() => {});
}

function sendResult(data) {
  chrome.runtime.sendMessage({ type: 'RESULT', data }).catch(() => {});
}

function sendBulkProgress(current, total) {
  chrome.runtime.sendMessage({ type: 'BULK_PROGRESS', current, total }).catch(() => {});
}

function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, function (token) {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

async function fetchSheetData(token, spreadsheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    let errorMsg = response.statusText;
    try {
      const errorBody = await response.json();
      errorMsg = errorBody.error ? `${response.status} - ${errorBody.error.message}` : `${response.status} - ${JSON.stringify(errorBody)}`;
    } catch (e) {
      errorMsg = `${response.status} - ${response.statusText}`;
    }
    throw new Error(`Sheets API Error: ${errorMsg}`);
  }
  return await response.json();
}

async function updateSheetCell(token, spreadsheetId, range, value) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: [[value]] })
  });
  if (!response.ok) {
    let errorMsg = response.statusText;
    try {
      const errorBody = await response.json();
      if (errorBody.error) errorMsg = `${response.status} - ${errorBody.error.message}`;
    } catch (e) {
      errorMsg = `${response.status} - ${response.statusText}`;
    }
    throw new Error(`Sheets API Error: ${errorMsg}`);
  }
  return await response.json();
}

function safeSheetRef(sheetName) {
  if (sheetName.includes(' ') && !sheetName.startsWith("'")) {
    return `'${sheetName}'`;
  }
  return sheetName;
}

function selectBestResults(result) {
  let bestPerson = null;
  let bestPersonEmail = null;

  if (result.people.length > 0) {
    const withEmail = result.people.filter(p => p.email);
    if (withEmail.length > 0) {
      bestPerson = withEmail[0];
      bestPersonEmail = withEmail[0].email;
    } else {
      bestPerson = result.people[0];
      if (result.personalEmails.length > 0) {
        bestPersonEmail = result.personalEmails[0];
      }
    }
  }

  if (!bestPersonEmail && result.personalEmails.length > 0) {
    bestPersonEmail = result.personalEmails[0];
  }

  const email = bestPersonEmail || (result.companyEmails.length > 0 ? result.companyEmails[0] : '');

  let contactEmail = result.companyEmails.length > 0 ? result.companyEmails[0] : null;
  if (contactEmail && contactEmail === email && result.companyEmails.length > 1) {
    contactEmail = result.companyEmails[1];
  } else if (contactEmail && contactEmail === email) {
    contactEmail = null;
  }

  const contactValue = contactEmail || result.contactPageUrl || '';
  const name = bestPerson ? bestPerson.name + (bestPerson.role ? ' (' + bestPerson.role + ')' : '') : '';

  return { name, email, contactEmail: contactValue, bestPerson };
}

async function processRow(token, rowIndex, url, sheetName, spreadsheetId) {
  log(`Processing Row ${rowIndex}: ${url}`);
  const { crawlDomain } = self.crawlerModule;
  const result = await crawlDomain(url);

  const safe = safeSheetRef(sheetName);
  const updates = { found: 0 };
  const best = selectBestResults(result);

  if (best.name) {
    const nameRange = `${safe}!H${rowIndex}`;
    try {
      await updateSheetCell(token, spreadsheetId, nameRange, best.name);
      log(`Found person: ${best.name}`, 'success');
    } catch (e) {
      log(`Warning: Could not write Name to Column H. (${e.message})`, 'warn');
    }
  }

  const emailRange = `${safe}!I${rowIndex}`;
  if (best.email) {
    log(`Found email: ${best.email}`, 'success');
    updates.found = 1;
    await updateSheetCell(token, spreadsheetId, emailRange, best.email);
  } else {
    log(`No email found for ${url}`, 'info');
    await updateSheetCell(token, spreadsheetId, emailRange, "Not Found");
  }

  if (best.contactEmail) {
    const contactRange = `${safe}!J${rowIndex}`;
    try {
      await updateSheetCell(token, spreadsheetId, contactRange, best.contactEmail);
      log(`Contact: ${best.contactEmail}`, 'success');
    } catch (e) {
      log(`Warning: Could not write to Column J. (${e.message})`, 'warn');
    }
  }

  sendResult({
    domain: url,
    name: best.name,
    email: best.email,
    contactEmail: best.contactEmail,
    people: result.people,
  });

  return updates;
}

async function startQueueProcessing() {
  const alarm = await chrome.alarms.get(ALARM_NAME);
  if (!alarm) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
    log("Process alarm started.");
  }
}

async function stopProcessing() {
  await updateState({ isRunning: false });
  await chrome.alarms.clear(ALARM_NAME);
  setStatus('Stopped');
  log("Processing stopped by user.");
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    const state = await getStoredState();
    if (!state.isRunning) {
      await chrome.alarms.clear(ALARM_NAME);
      return;
    }

    const queue = state.queue || [];
    if (queue.length === 0) {
      await updateState({ isRunning: false });
      await chrome.alarms.clear(ALARM_NAME);
      setStatus('Complete');
      log("All rows processed! Job Complete.", 'success');
      return;
    }

    const item = queue.shift();
    await updateState({ queue });

    try {
      const token = await getAuthToken();
      const resultStats = await processRow(token, item.rowIndex, item.url, state.currentSheetName, state.currentSpreadsheetId);

      const newStats = state.stats || { processed: 0, found: 0 };
      newStats.processed += 1;
      newStats.found += resultStats.found;
      await updateState({ stats: newStats });
    } catch (e) {
      log(`Error processing row ${item.rowIndex}: ${e.message}`, 'error');
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'AUTH') {
    getAuthToken(true)
      .then(token => sendResponse({ success: true, token }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'SCAN_SINGLE') {
    const { url } = request;
    (async () => {
      try {
        const { crawlDomain } = self.crawlerModule;
        const result = await crawlDomain(url);
        const best = selectBestResults(result);

        sendResponse({
          success: true,
          data: {
            domain: url,
            name: best.name,
            email: best.email,
            contactEmail: best.contactEmail,
            people: result.people,
          }
        });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (request.action === 'BULK_START') {
    const { domains } = request;
    (async () => {
      const { crawlDomain } = self.crawlerModule;
      const total = domains.length;
      let foundTotal = 0;
      log(`Starting bulk scan of ${total} domains...`);
      setStatus('Running');

      for (let i = 0; i < total; i++) {
        const domain = domains[i];
        sendBulkProgress(i, total);
        log(`Scanning [${i + 1}/${total}]: ${domain}`);

        try {
          const result = await crawlDomain(domain);
          const best = selectBestResults(result);

          sendResult({
            domain,
            name: best.name,
            email: best.email,
            contactEmail: best.contactEmail,
            people: result.people,
          });

          if (best.email) foundTotal++;
          const stats = { processed: i + 1, found: foundTotal };
          chrome.runtime.sendMessage({ type: 'STATS', ...stats }).catch(() => {});

          if (best.email) {
            log(`Found email: ${best.email} for ${domain}`, 'success');
          } else {
            log(`No emails found for ${domain}`, 'info');
          }
        } catch (e) {
          log(`Error scanning ${domain}: ${e.message}`, 'error');
        }
      }

      sendBulkProgress(total, total);
      setStatus('Complete');
      log(`Bulk scan complete! Processed ${total} domains.`, 'success');
    })();
    return false;
  }

  if (request.action === 'START') {
    const { spreadsheetId, sheetName } = request;
    (async () => {
      try {
        const token = await getAuthToken();
        log('Initializing Batch Processing...');
        log('Reading URLs from Column C, writing Name→H, Email→I, Contact→J');

        const safe = safeSheetRef(sheetName);
        const range = `${safe}!C2:I`;
        const data = await fetchSheetData(token, spreadsheetId, range);
        const rows = data.values || [];

        log(`Found ${rows.length} total rows in sheet.`);

        const newQueue = [];
        for (let i = 0; i < rows.length; i++) {
          const rowData = rows[i];
          const url = rowData[0];
          const existingEmail = rowData[6];

          if (!url) continue;
          if (existingEmail && existingEmail.length > 2 && existingEmail.toLowerCase() !== 'not found') continue;

          newQueue.push({ rowIndex: i + 2, url });
        }

        log(`${newQueue.length} rows queued for processing.`);

        await updateState({
          isRunning: true,
          currentSpreadsheetId: spreadsheetId,
          currentSheetName: sheetName,
          queue: newQueue,
          stats: { processed: 0, found: 0 }
        });

        setStatus('Running');
        startQueueProcessing();
      } catch (e) {
        log(`Startup Error: ${e.message}`, 'error');
        setStatus('Error');
      }
    })();
  }

  if (request.action === 'STOP') {
    stopProcessing();
  }
});
