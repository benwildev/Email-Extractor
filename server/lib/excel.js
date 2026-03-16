const XLSX = require('xlsx');

function colIndex(letter) {
  let index = 0;
  for (let i = 0; i < letter.length; i++) {
    index = index * 26 + (letter.charCodeAt(i) - 64);
  }
  return index - 1;
}

function cellRef(col, row) {
  return col + row;
}

function parseExcelFile(buffer, sheetName, startRow, endRow) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const name = sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    throw new Error(`Sheet "${name}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`);
  }

  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const queue = [];

  const start = startRow ? Math.max(1, parseInt(startRow) - 1) : 1;
  const end = endRow ? Math.min(range.e.r, parseInt(endRow) - 1) : range.e.r;

  for (let row = start; row <= end; row++) {
    const urlCell = sheet[cellRef('C', row + 1)];
    const emailCell = sheet[cellRef('I', row + 1)];

    const url = urlCell ? String(urlCell.v || '').trim() : '';
    const existingEmail = emailCell ? String(emailCell.v || '').trim() : '';

    if (!url) continue;
    if (existingEmail && existingEmail.length > 2 && existingEmail.toLowerCase() !== 'not found') continue;

    queue.push({ rowIndex: row + 1, url });
  }

  return { queue, sheetName: name, sheetNames: workbook.SheetNames };
}

function writeResultsToExcel(buffer, sheetName, results) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const name = sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    throw new Error(`Sheet "${name}" not found.`);
  }

  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

  for (const result of results) {
    const row = result.rowIndex;

    if (result.name) {
      sheet[cellRef('H', row)] = { t: 's', v: result.name };
    }

    if (result.email) {
      sheet[cellRef('I', row)] = { t: 's', v: result.email };
    } else {
      sheet[cellRef('I', row)] = { t: 's', v: 'Not Found' };
    }

    if (result.contactEmail) {
      sheet[cellRef('J', row)] = { t: 's', v: result.contactEmail };
    }

    if (result.verificationStatus) {
      sheet[cellRef('L', row)] = { t: 's', v: result.verificationStatus };
    }

    if (row - 1 > range.e.r) range.e.r = row - 1;
    if (11 > range.e.c) range.e.c = 11;
  }

  sheet['!ref'] = XLSX.utils.encode_range(range);

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function getSheetPreviewFromWorkbook(workbook, sheetName, startRow, endRow) {
  const name = sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[name];
  if (!sheet) return { headers: [], rows: [] };

  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const maxCol = Math.max(range.e.c, 11);

  const colLetters = [];
  for (let c = 0; c <= maxCol; c++) {
    colLetters.push(XLSX.utils.encode_col(c));
  }

  const headers = [];
  for (let c = 0; c <= maxCol; c++) {
    const cell = sheet[colLetters[c] + '1'];
    headers.push(cell ? String(cell.v || '') : '');
  }

  const totalRows = range.e.r;
  const PREVIEW_LIMIT = 500;
  
  const start = startRow ? Math.max(1, parseInt(startRow) - 1) : 1;
  const end = endRow ? Math.min(range.e.r, parseInt(endRow) - 1) : Math.min(range.e.r, start + PREVIEW_LIMIT - 1);

  const rows = [];
  for (let r = start; r <= end; r++) {
    if (rows.length >= PREVIEW_LIMIT) break;
    const rowData = { rowIndex: r + 1, cells: [] };
    for (let c = 0; c <= maxCol; c++) {
      const cell = sheet[colLetters[c] + (r + 1)];
      rowData.cells.push(cell ? String(cell.v || '') : '');
    }
    rows.push(rowData);
  }

  return { headers, rows, colLetters, totalRows };
}

function getSheetPreview(buffer, sheetName, startRow, endRow) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return getSheetPreviewFromWorkbook(workbook, sheetName, startRow, endRow);
}

module.exports = {
  parseExcelFile,
  writeResultsToExcel,
  getSheetPreview,
  getSheetPreviewFromWorkbook,
};
