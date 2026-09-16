export interface ExportColumn {
  key: string;
  header: string;
}

/** RFC 4180: quote a field if it contains a comma, quote, or newline; double up embedded quotes. */
function escapeCsvField(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Generates a CSV string for the given columns/rows. Zero rows still produce a valid file
 * with just the header line (Section 20: "produces a valid, empty file with headers only").
 */
export function generateCsv(columns: ExportColumn[], rows: Record<string, unknown>[]): string {
  const headerLine = columns.map((column) => escapeCsvField(column.header)).join(',');
  const dataLines = rows.map((row) =>
    columns.map((column) => escapeCsvField(row[column.key])).join(','),
  );
  return [headerLine, ...dataLines].join('\r\n');
}
