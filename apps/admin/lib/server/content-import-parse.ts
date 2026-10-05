import { inflateRawSync } from 'node:zlib';

import {
  resolveColumnKey,
  type ImportColumnKey,
  IMPORT_COLUMNS,
  REQUIRED_COLUMN_KEYS,
} from './content-import-contract';

/**
 * Phase 1 / Milestone 1.3 — CSV and XLSX readers.
 *
 * XLSX is read with Node's built-in `zlib` (an .xlsx file is a ZIP of XML parts) rather than by
 * adding a spreadsheet dependency: the Admin content pipeline is private and a third-party parser
 * would be new supply-chain surface for a format we only need to READ. Only the two parts the
 * contract needs are decoded — the shared string table and the first worksheet.
 */

export type ParsedRecord = Partial<Record<ImportColumnKey, string>>;

export interface ParsedSheet {
  records: ParsedRecord[];
  /** Header labels that matched no canonical column, surfaced so the file can be corrected. */
  unknownHeaders: string[];
  /** Canonical required columns that the file does not provide at all. */
  missingRequiredColumns: string[];
}

export class ImportParseError extends Error {}

/** Hard ceiling, matched by the route's body limit. Keeps a hostile upload from exhausting memory. */
export const MAX_IMPORT_ROWS = 2000;

function finishRecords(
  headerKeys: Array<ImportColumnKey | undefined>,
  unknownHeaders: string[],
  rows: string[][],
): ParsedSheet {
  const records: ParsedRecord[] = [];
  for (const cells of rows) {
    if (cells.every((cell) => cell.trim() === '')) continue;
    const record: ParsedRecord = {};
    headerKeys.forEach((key, index) => {
      if (key) record[key] = cells[index] ?? '';
    });
    records.push(record);
    if (records.length > MAX_IMPORT_ROWS) {
      throw new ImportParseError(`فایل بیش از ${MAX_IMPORT_ROWS} سطر دارد.`);
    }
  }
  const present = new Set(headerKeys.filter((key): key is ImportColumnKey => Boolean(key)));
  const missingRequiredColumns = REQUIRED_COLUMN_KEYS.filter((key) => !present.has(key)).map(
    (key) => IMPORT_COLUMNS.find((column) => column.key === key)!.label,
  );
  return { records, unknownHeaders, missingRequiredColumns };
}

function mapHeaderRow(header: string[]): {
  keys: Array<ImportColumnKey | undefined>;
  unknown: string[];
} {
  const keys: Array<ImportColumnKey | undefined> = [];
  const unknown: string[] = [];
  const seen = new Set<ImportColumnKey>();
  for (const cell of header) {
    // The template marks required columns with a trailing '*'; accept the file either way.
    const key = resolveColumnKey(cell.replace(/\*\s*$/, ''));
    if (!key) {
      if (cell.trim()) unknown.push(cell.trim());
      keys.push(undefined);
      continue;
    }
    if (seen.has(key)) {
      throw new ImportParseError(`ستون «${cell.trim()}» بیش از یک بار آمده است.`);
    }
    seen.add(key);
    keys.push(key);
  }
  return { keys, unknown };
}

/** RFC4180 CSV reader: quoted fields, escaped quotes, CRLF, and a comma or semicolon delimiter. */
export function parseCsv(input: string): ParsedSheet {
  const text = input.replace(/^\ufeff/, '');
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  // Excel in a Persian/European locale writes semicolon-separated CSV.
  const delimiter = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';

  const rows: string[][] = [];
  let cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index += 1;
        } else quoted = false;
      } else value += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(value);
      value = '';
    } else if (char === '\n') {
      cells.push(value);
      rows.push(cells);
      cells = [];
      value = '';
    } else if (char !== '\r') {
      value += char;
    }
  }
  if (value !== '' || cells.length > 0) {
    cells.push(value);
    rows.push(cells);
  }
  if (rows.length === 0) throw new ImportParseError('فایل خالی است.');

  const { keys, unknown } = mapHeaderRow(rows[0]!);
  return finishRecords(keys, unknown, rows.slice(1));
}

/* ---------------------------------------------------------------------------------------------
 * Minimal ZIP reader — enough to pull two named entries out of an .xlsx container.
 * ------------------------------------------------------------------------------------------- */

function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  // Locate the End Of Central Directory record (scan back over the optional comment).
  let eocd = -1;
  for (let index = buffer.length - 22; index >= 0 && index > buffer.length - 65558; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new ImportParseError('فایل XLSX معتبر نیست.');

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, Buffer>();

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    if (buffer.readUInt32LE(localOffset) === 0x04034b50) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const raw = buffer.subarray(dataStart, dataStart + compressedSize);
      try {
        entries.set(name, method === 0 ? raw : inflateRawSync(raw));
      } catch {
        throw new ImportParseError('فایل XLSX قابل خواندن نیست.');
      }
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&amp;/g, '&');
}

/** Shared strings: each <si> is one string, possibly split across several <t> runs. */
function readSharedStrings(xml: string): string[] {
  const items = xml.match(/<si[\s>][\s\S]*?<\/si>|<si\/>/g) ?? [];
  return items.map((item) => {
    const runs = item.match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? [];
    return runs.map(decodeXmlText).join('');
  });
}

function columnIndexFromRef(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? '';
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

export function parseXlsx(buffer: Buffer): ParsedSheet {
  const entries = readZipEntries(buffer);
  const sheetName =
    [...entries.keys()].find((name) => /^xl\/worksheets\/sheet1\.xml$/.test(name)) ??
    [...entries.keys()].find((name) => /^xl\/worksheets\/.*\.xml$/.test(name));
  if (!sheetName) throw new ImportParseError('کاربرگی در فایل XLSX پیدا نشد.');

  const sharedXml = entries.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  const shared = sharedXml ? readSharedStrings(sharedXml) : [];
  const sheetXml = entries.get(sheetName)!.toString('utf8');

  const rows: string[][] = [];
  const rowMatches = sheetXml.match(/<row[\s>][\s\S]*?<\/row>|<row[^>]*\/>/g) ?? [];
  for (const rowXml of rowMatches) {
    const cells: string[] = [];
    const cellMatches = rowXml.match(/<c[\s>][\s\S]*?<\/c>|<c[^>]*\/>/g) ?? [];
    for (const cellXml of cellMatches) {
      const ref = /r="([A-Z]+\d+)"/.exec(cellXml)?.[1];
      const type = /t="([^"]+)"/.exec(cellXml)?.[1];
      let text = '';
      if (type === 's') {
        const index = Number(decodeXmlText(/<v>([\s\S]*?)<\/v>/.exec(cellXml)?.[1] ?? ''));
        text = shared[index] ?? '';
      } else if (type === 'inlineStr') {
        text = decodeXmlText(/<is>([\s\S]*?)<\/is>/.exec(cellXml)?.[0] ?? '');
      } else {
        text = decodeXmlText(/<v>([\s\S]*?)<\/v>/.exec(cellXml)?.[1] ?? '');
      }
      const position = ref ? columnIndexFromRef(ref) : cells.length;
      while (cells.length < position) cells.push('');
      cells[position] = text;
    }
    rows.push(cells);
  }
  if (rows.length === 0) throw new ImportParseError('کاربرگ خالی است.');

  const { keys, unknown } = mapHeaderRow(rows[0]!);
  return finishRecords(keys, unknown, rows.slice(1));
}

/** Dispatches on the real container signature, not on a client-supplied content type. */
export function parseImportFile(filename: string, bytes: Buffer): ParsedSheet {
  const isZip = bytes.length > 4 && bytes.readUInt32LE(0) === 0x04034b50;
  if (isZip) return parseXlsx(bytes);
  if (/\.xlsx$/i.test(filename)) {
    throw new ImportParseError('فایل XLSX معتبر نیست. لطفاً دوباره ذخیره و بارگذاری کنید.');
  }
  return parseCsv(bytes.toString('utf8'));
}
