import ExcelJS from 'exceljs';

import type { ExportColumn } from './csvGenerator.js';

/** Zero rows still produce a valid workbook with just the header row (Section 20). */
export async function generateExcel(
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  sheetName = 'Report',
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((column) => ({ header: column.header, key: column.key, width: 18 }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(row);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
