// Minimal CSV parser supporting quoted fields, escaped quotes ("") and
// commas/newlines inside quotes. Returns an array of rows (arrays of cells).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Normalize line endings
  const input = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  // Flush trailing field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty rows
  return rows.filter(r => r.some(cell => cell.trim().length > 0));
}

/**
 * Parse a CSV with a header row into one object per row, keyed by the
 * header cells. A leading byte-order mark on the first header is ignored.
 */
export function parseCsvObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const [header = [], ...body] = parseCsv(text);
  const headers = header.map((h, i) => (i === 0 ? h.replace(/^\uFEFF/, '') : h).trim());
  const rows = body.map(cells =>
    Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])),
  );
  return { headers, rows };
}
