import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import {
  buildCsvTemplate,
  foldDigits,
  IMPORT_COLUMNS,
  mapRow,
  resolveColumnKey,
  splitMultiValue,
} from '../lib/server/content-import-contract';
import {
  ImportParseError,
  parseCsv,
  parseImportFile,
  parseXlsx,
} from '../lib/server/content-import-parse';

/**
 * Phase 1 / M1.3 — CSV/XLSX contract + parser tests.
 *
 * The XLSX fixtures are built here with Node's `zlib`, so the reader is exercised against a real
 * ZIP container (central directory, local headers, deflate) rather than a mock.
 */

function headerLine(): string {
  return IMPORT_COLUMNS.map((column) =>
    column.required ? `${column.label} *` : column.label,
  ).join(',');
}

function rowFor(overrides: Record<string, string> = {}): string {
  return IMPORT_COLUMNS.map((column) => {
    const value = overrides[column.key] ?? column.example;
    return /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(',');
}

/** Builds a real .xlsx (ZIP of XML) containing one sheet with the given rows. */
function buildXlsx(rows: string[][]): Buffer {
  const strings: string[] = [];
  const indexOf = (value: string) => {
    const existing = strings.indexOf(value);
    if (existing >= 0) return existing;
    strings.push(value);
    return strings.length - 1;
  };
  const escape = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const sheetRows = rows
    .map((cells, rowIndex) => {
      const body = cells
        .map((cell, columnIndex) => {
          const ref = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
          return `<c r="${ref}" t="s"><v>${indexOf(cell)}</v></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${body}</row>`;
    })
    .join('');

  const sheetXml = `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`;
  const sharedXml = `<?xml version="1.0"?><sst count="${strings.length}">${strings
    .map((value) => `<si><t>${escape(value)}</t></si>`)
    .join('')}</sst>`;

  const entries: Array<{ name: string; data: Buffer }> = [
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml, 'utf8') },
    { name: 'xl/sharedStrings.xml', data: Buffer.from(sharedXml, 'utf8') },
  ];

  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const compressed = deflateRawSync(entry.data);
    const name = Buffer.from(entry.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 14); // crc (not verified by the reader)
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(Buffer.concat([local, name, compressed]));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += 30 + name.length + compressed.length;
  }

  const localBlock = Buffer.concat(locals);
  const centralBlock = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);
  return Buffer.concat([localBlock, centralBlock, eocd]);
}

describe('M1.3 import contract', () => {
  it('requires exactly the fields the canonical card model requires', () => {
    const required = IMPORT_COLUMNS.filter((column) => column.required).map((column) => column.key);
    expect(required).toEqual([
      'lemma',
      'persian_meanings',
      'simple_german_definition',
      'grammar_note',
      'topic_tags',
      'difficulty',
      'visual_concept',
      'image_prompt',
      'source_reference',
    ]);
  });

  it('does NOT require fields the canonical model treats as optional', () => {
    const optional = IMPORT_COLUMNS.filter((column) => !column.required).map(
      (column) => column.key,
    );
    expect(optional).toContain('article');
    expect(optional).toContain('pronunciation_ipa');
    expect(optional).toContain('cefr');
    expect(optional).toContain('example_german');
    expect(optional).toContain('essential_inflection');
  });

  it('generates the template from the contract, marking required columns', () => {
    const csv = buildCsvTemplate({ withExample: true });
    const [header, example] = csv
      .replace(/^\ufeff/, '')
      .trim()
      .split('\n');
    expect(header).toContain('واژهٔ آلمانی *');
    expect(header).toContain('حرف تعریف');
    expect(header).not.toContain('حرف تعریف *');
    expect(example).toContain('Tisch');
    // Every contract column appears, so the template cannot drift from the parser.
    expect(header!.split(',').length).toBe(IMPORT_COLUMNS.length);
  });

  it('maps headers by Persian label or by key, tolerating the required marker', () => {
    expect(resolveColumnKey('واژهٔ آلمانی')).toBe('lemma');
    expect(resolveColumnKey('persian_meanings')).toBe('persian_meanings');
    expect(resolveColumnKey('  معنی فارسی  ')).toBe('persian_meanings');
    expect(resolveColumnKey('ستون ناشناس')).toBeUndefined();
  });

  it('folds Persian digits and splits multi-value cells', () => {
    expect(foldDigits('۳')).toBe('3');
    expect(splitMultiValue('میز؛ میزکار | تخته')).toEqual(['میز', 'میزکار', 'تخته']);
  });

  it('reports every missing required field with its row number', () => {
    const result = mapRow({ lemma: 'Tisch' }, 7);
    expect(result.rowNumber).toBe(7);
    expect(result.content).toBeUndefined();
    const fields = result.issues.map((issue) => issue.field);
    expect(fields).toContain('persian_meanings');
    expect(fields).toContain('difficulty');
    expect(fields).not.toContain('lemma');
  });

  it('rejects malformed enum and out-of-range values', () => {
    const base = Object.fromEntries(
      IMPORT_COLUMNS.map((column) => [column.key, column.example]),
    ) as Record<string, string>;
    expect(mapRow({ ...base, article: 'le' }, 2).issues[0]!.field).toBe('article');
    expect(mapRow({ ...base, difficulty: '9' }, 2).issues[0]!.field).toBe('difficulty');
    expect(mapRow({ ...base, cefr: 'Z9' }, 2).issues[0]!.field).toBe('cefr');
    expect(mapRow({ ...base, part_of_speech: 'nounish' }, 2).issues[0]!.field).toBe(
      'part_of_speech',
    );
  });

  it('requires a German example and its Persian translation together', () => {
    const base = Object.fromEntries(
      IMPORT_COLUMNS.map((column) => [column.key, column.example]),
    ) as Record<string, string>;
    expect(mapRow({ ...base, example_persian: '' }, 2).issues[0]!.field).toBe('example');
    const neither = mapRow({ ...base, example_german: '', example_persian: '' }, 2);
    expect(neither.issues).toEqual([]);
    expect(neither.content!.examples).toEqual([]);
  });

  it('accepts a valid row and builds canonical input', () => {
    const base = Object.fromEntries(
      IMPORT_COLUMNS.map((column) => [column.key, column.example]),
    ) as Record<string, string>;
    const result = mapRow({ ...base, difficulty: '۲' }, 2);
    expect(result.issues).toEqual([]);
    expect(result.content).toMatchObject({
      lemma: 'Tisch',
      article: 'der',
      difficulty: 2,
      cefr: 'A1',
      persianMeanings: ['میز', 'میزکار'],
    });
  });
});

describe('M1.3 CSV parser', () => {
  it('parses the generated template round-trip', () => {
    const sheet = parseCsv(buildCsvTemplate({ withExample: true }));
    expect(sheet.missingRequiredColumns).toEqual([]);
    expect(sheet.unknownHeaders).toEqual([]);
    expect(sheet.records).toHaveLength(1);
    expect(sheet.records[0]!.lemma).toBe('Tisch');
  });

  it('handles quoted fields, embedded commas, escaped quotes and CRLF', () => {
    const csv = `${headerLine()}\r\n${rowFor({
      persian_meanings: 'میز, بزرگ',
      grammar_note: 'او گفت "Tisch"',
    })}\r\n`;
    const sheet = parseCsv(csv);
    expect(sheet.records[0]!.persian_meanings).toBe('میز, بزرگ');
    expect(sheet.records[0]!.grammar_note).toBe('او گفت "Tisch"');
  });

  it('accepts semicolon-delimited CSV from a European Excel locale', () => {
    const header = IMPORT_COLUMNS.map((column) => column.label).join(';');
    const row = IMPORT_COLUMNS.map((column) => column.example.replace(/؛/g, '|')).join(';');
    const sheet = parseCsv(`${header}\n${row}\n`);
    expect(sheet.missingRequiredColumns).toEqual([]);
    expect(sheet.records[0]!.lemma).toBe('Tisch');
  });

  it('reports unknown headers and missing required columns instead of guessing', () => {
    const sheet = parseCsv('واژهٔ آلمانی,ستون عجیب\nTisch,x\n');
    expect(sheet.unknownHeaders).toEqual(['ستون عجیب']);
    expect(sheet.missingRequiredColumns).toContain('معنی فارسی');
  });

  it('rejects a duplicated column and an empty file', () => {
    expect(() => parseCsv('واژهٔ آلمانی,واژهٔ آلمانی\na,b\n')).toThrow(ImportParseError);
    expect(() => parseCsv('')).toThrow(ImportParseError);
  });

  it('skips fully blank lines rather than treating them as rows', () => {
    const sheet = parseCsv(`${headerLine()}\n${rowFor()}\n\n\n`);
    expect(sheet.records).toHaveLength(1);
  });
});

describe('M1.3 XLSX parser', () => {
  const header = IMPORT_COLUMNS.map((column) => column.label);

  it('reads a real XLSX container built as a ZIP of XML', () => {
    const buffer = buildXlsx([header, IMPORT_COLUMNS.map((column) => column.example)]);
    const sheet = parseXlsx(buffer);
    expect(sheet.missingRequiredColumns).toEqual([]);
    expect(sheet.records).toHaveLength(1);
    expect(sheet.records[0]!.lemma).toBe('Tisch');
    expect(sheet.records[0]!.persian_meanings).toBe('میز؛ میزکار');
  });

  it('decodes XML entities and preserves Persian text', () => {
    const buffer = buildXlsx([
      header,
      IMPORT_COLUMNS.map((column) =>
        column.key === 'grammar_note' ? 'a & b < c' : column.example,
      ),
    ]);
    expect(parseXlsx(buffer).records[0]!.grammar_note).toBe('a & b < c');
  });

  it('dispatches on the real container signature, not the filename', () => {
    const xlsx = buildXlsx([header, IMPORT_COLUMNS.map((column) => column.example)]);
    expect(parseImportFile('whatever.csv', xlsx).records).toHaveLength(1);

    const csv = Buffer.from(buildCsvTemplate({ withExample: true }), 'utf8');
    expect(parseImportFile('sheet.csv', csv).records).toHaveLength(1);
  });

  it('refuses a file that claims to be XLSX but is not a ZIP', () => {
    expect(() => parseImportFile('broken.xlsx', Buffer.from('not a zip', 'utf8'))).toThrow(
      ImportParseError,
    );
  });

  it('refuses a corrupt ZIP without crashing', () => {
    const corrupt = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]);
    expect(() => parseImportFile('x.xlsx', corrupt)).toThrow(ImportParseError);
  });
});
