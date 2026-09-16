import { describe, expect, it } from 'vitest';

import { generateCsv } from './csvGenerator.js';

describe('generateCsv (TASK-029)', () => {
  it('produces a header-only file for zero rows (Section 20)', () => {
    const csv = generateCsv([{ key: 'name', header: 'Name' }], []);
    expect(csv).toBe('Name');
  });

  it('quotes fields containing commas, quotes, or newlines', () => {
    const csv = generateCsv(
      [{ key: 'note', header: 'Note' }],
      [{ note: 'Hello, "world"\nnext line' }],
    );
    expect(csv).toBe('Note\r\n"Hello, ""world""\nnext line"');
  });

  it('renders exactly the given rows and columns, in order', () => {
    const csv = generateCsv(
      [
        { key: 'a', header: 'A' },
        { key: 'b', header: 'B' },
      ],
      [
        { a: '1', b: '2' },
        { a: '3', b: '4' },
      ],
    );
    expect(csv).toBe('A,B\r\n1,2\r\n3,4');
  });

  it('renders null/undefined as an empty field', () => {
    const csv = generateCsv([{ key: 'x', header: 'X' }], [{ x: null }, { x: undefined }]);
    expect(csv).toBe('X\r\n\r\n');
  });
});
