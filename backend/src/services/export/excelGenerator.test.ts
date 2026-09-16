import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { generateExcel } from './excelGenerator.js';

describe('generateExcel (TASK-029)', () => {
  it('produces a header-only workbook for zero rows (Section 20)', async () => {
    const buffer = await generateExcel([{ key: 'name', header: 'Name' }], []);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet('Report')!;
    expect(sheet.rowCount).toBe(1);
    expect(sheet.getRow(1).getCell(1).value).toBe('Name');
  });

  it('round-trips the given rows with bold headers', async () => {
    const buffer = await generateExcel(
      [
        { key: 'code', header: 'Code' },
        { key: 'revenue', header: 'Revenue' },
      ],
      [
        { code: 'GEN-001', revenue: '1000.00' },
        { code: 'GEN-002', revenue: '2000.00' },
      ],
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet('Report')!;

    expect(sheet.rowCount).toBe(3);
    expect(sheet.getRow(1).font?.bold).toBe(true);
    expect(sheet.getRow(2).getCell(1).value).toBe('GEN-001');
    expect(sheet.getRow(2).getCell(2).value).toBe('1000.00');
    expect(sheet.getRow(3).getCell(1).value).toBe('GEN-002');
  });
});
