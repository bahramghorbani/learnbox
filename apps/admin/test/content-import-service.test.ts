import { describe, expect, it, vi } from 'vitest';

import { buildCsvTemplate, IMPORT_COLUMNS } from '../lib/server/content-import-contract';
import { ContentImportService, rowIdempotencyKey } from '../lib/server/content-import-service';
import type { CardWriteResult } from '../lib/server/postgres-content-packs-write-store';

/**
 * Phase 1 / M1.3 — import analysis and confirmed-write behaviour.
 *
 * The write store is a spy so the tests can assert the two guarantees that matter most:
 * preview NEVER writes, and only rows classified `new` ever reach the canonical write path.
 */

const header = IMPORT_COLUMNS.map((column) => column.label).join(',');
const cell = (value: string) => (/[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

function csvRow(overrides: Record<string, string> = {}): string {
  return IMPORT_COLUMNS.map((column) => cell(overrides[column.key] ?? column.example)).join(',');
}

function csvFile(rows: Array<Record<string, string>>): Buffer {
  return Buffer.from(`${header}\n${rows.map((row) => csvRow(row)).join('\n')}\n`, 'utf8');
}

function makeHarness(
  options: { existingContentIds?: string[]; createCard?: () => CardWriteResult } = {},
) {
  const queries: Array<{ sql: string; parameters?: readonly unknown[] }> = [];
  const pool = {
    query: vi.fn(async (sql: string, parameters?: readonly unknown[]) => {
      queries.push({ sql, parameters });
      if (/FROM packs/.test(sql)) {
        return { rows: [{ id: 'learnbox-start', target_cefr: 'A1' }] };
      }
      if (/FROM cards WHERE content_id/.test(sql)) {
        return {
          rows: (options.existingContentIds ?? []).map((contentId) => ({ content_id: contentId })),
        };
      }
      return { rows: [] };
    }),
  };
  let created = 0;
  type CreateCardInput = {
    packId: string;
    content: { lemma: string };
    idempotencyKey: string;
    actorUserId: string;
  };
  const writeStore = {
    createCard: vi.fn<(input: CreateCardInput) => Promise<CardWriteResult>>(async () => {
      if (options.createCard) return options.createCard();
      created += 1;
      return {
        status: 'applied',
        cardId: `00000000-0000-4000-8000-${String(created).padStart(12, '0')}`,
        cardVersionId: `00000000-0000-4000-8000-${String(created + 500).padStart(12, '0')}`,
        version: 1,
      };
    }),
  };
  return {
    pool,
    writeStore,
    queries,
    service: new ContentImportService(pool, writeStore as never),
  };
}

const ACTOR = '33333333-3333-4333-8333-333333333333';
const IMPORT_KEY = '11111111-1111-4111-8111-111111111111';

describe('M1.3 import analysis', () => {
  it('performs NO write during preview — only reads', async () => {
    const harness = makeHarness();
    const result = await harness.service.analyze({
      packId: 'learnbox-start',
      filename: 'x.csv',
      bytes: csvFile([{}]),
    });
    expect(result.status).toBe('ok');
    expect(harness.writeStore.createCard).not.toHaveBeenCalled();
    // Every statement the preview issued must be a read.
    for (const query of harness.queries) {
      expect(query.sql).toMatch(/^\s*SELECT/i);
    }
    expect(harness.queries.some((q) => /INSERT|UPDATE|DELETE|BEGIN/i.test(q.sql))).toBe(false);
  });

  it('classifies new, duplicate-in-file, existing and invalid rows', async () => {
    const harness = makeHarness({ existingContentIds: ['start-a1-apfel'] });
    const bytes = csvFile([
      {}, // Tisch — new
      { lemma: 'Tisch' }, // same identity as row 2 → duplicate in file
      { lemma: 'Apfel' }, // already exists canonically
      { lemma: 'Stuhl', difficulty: '' }, // invalid: required field empty
    ]);
    const result = await harness.service.analyze({
      packId: 'learnbox-start',
      filename: 'x.csv',
      bytes,
    });
    if (result.status !== 'ok') throw new Error('expected ok');

    expect(result.analysis.totalRows).toBe(4);
    expect(result.analysis.counts).toEqual({
      new: 1,
      duplicate_in_file: 1,
      existing: 1,
      invalid: 1,
    });
    const byRow = new Map(result.analysis.rows.map((row) => [row.rowNumber, row]));
    expect(byRow.get(2)!.classification).toBe('new');
    expect(byRow.get(3)!.classification).toBe('duplicate_in_file');
    expect(byRow.get(3)!.duplicateOfRow).toBe(2);
    expect(byRow.get(4)!.classification).toBe('existing');
    expect(byRow.get(5)!.classification).toBe('invalid');
    // Invalid rows are reported, never silently dropped.
    expect(byRow.get(5)!.issues.map((issue) => issue.field)).toContain('difficulty');
  });

  it('uses the canonical content identity (pack + CEFR + lemma) for duplicates', async () => {
    const harness = makeHarness();
    const result = await harness.service.analyze({
      packId: 'learnbox-start',
      filename: 'x.csv',
      bytes: csvFile([{ lemma: 'Apfel' }]),
    });
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.analysis.rows[0]!.contentId).toBe('start-a1-apfel');
  });

  it('falls back to the pack CEFR when the column is empty, matching createCard', async () => {
    const harness = makeHarness();
    const result = await harness.service.analyze({
      packId: 'learnbox-start',
      filename: 'x.csv',
      bytes: csvFile([{ lemma: 'Apfel', cefr: '' }]),
    });
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.analysis.rows[0]!.contentId).toBe('start-a1-apfel');
  });

  it('marks every row invalid when a required column is absent from the file', async () => {
    const harness = makeHarness();
    const bytes = Buffer.from('واژهٔ آلمانی\nTisch\nStuhl\n', 'utf8');
    const result = await harness.service.analyze({
      packId: 'learnbox-start',
      filename: 'x.csv',
      bytes,
    });
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.analysis.counts.invalid).toBe(2);
    expect(result.analysis.importableCount).toBe(0);
    expect(result.analysis.missingRequiredColumns).toContain('معنی فارسی');
  });

  it('reports an unreadable file instead of throwing', async () => {
    const harness = makeHarness();
    const result = await harness.service.analyze({
      packId: 'learnbox-start',
      filename: 'broken.xlsx',
      bytes: Buffer.from('not a spreadsheet', 'utf8'),
    });
    expect(result.status).toBe('unreadable');
  });

  it('returns not_found for an unknown pack', async () => {
    const pool = { query: vi.fn(async () => ({ rows: [] })) };
    const service = new ContentImportService(pool, { createCard: vi.fn() } as never);
    const result = await service.analyze({
      packId: 'does-not-exist',
      filename: 'x.csv',
      bytes: csvFile([{}]),
    });
    expect(result.status).toBe('not_found');
  });
});

describe('M1.3 confirmed import', () => {
  async function confirm(harness: ReturnType<typeof makeHarness>, bytes: Buffer) {
    const preview = await harness.service.analyze({
      packId: 'learnbox-start',
      filename: 'x.csv',
      bytes,
    });
    if (preview.status !== 'ok') throw new Error('expected ok');
    return harness.service.apply({
      packId: 'learnbox-start',
      filename: 'x.csv',
      bytes,
      actorUserId: ACTOR,
      importKey: IMPORT_KEY,
      expectedFingerprint: preview.analysis.importableFingerprint,
    });
  }

  it('writes ONLY the rows classified new', async () => {
    const harness = makeHarness({ existingContentIds: ['start-a1-apfel'] });
    const bytes = csvFile([
      {},
      { lemma: 'Tisch' },
      { lemma: 'Apfel' },
      { lemma: 'Stuhl', difficulty: '' },
    ]);
    const result = await confirm(harness, bytes);
    if (result.status !== 'applied') throw new Error(`expected applied, got ${result.status}`);

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(3);
    expect(harness.writeStore.createCard).toHaveBeenCalledTimes(1);
    const call = harness.writeStore.createCard.mock.calls[0]![0];
    expect(call.content.lemma).toBe('Tisch');
    // The existing card was never touched.
    const reasons = result.outcomes.filter((o) => o.status === 'skipped').map((o) => o.reason);
    expect(reasons).toContain('existing');
    expect(reasons).toContain('duplicate_in_file');
    expect(reasons).toContain('invalid');
  });

  it('refuses to apply when the file no longer matches the preview', async () => {
    const harness = makeHarness();
    const result = await harness.service.apply({
      packId: 'learnbox-start',
      filename: 'x.csv',
      bytes: csvFile([{}]),
      actorUserId: ACTOR,
      importKey: IMPORT_KEY,
      expectedFingerprint: 'f'.repeat(64),
    });
    expect(result.status).toBe('stale');
    expect(harness.writeStore.createCard).not.toHaveBeenCalled();
  });

  it('derives a stable per-row idempotency key so a retry cannot double-import', async () => {
    const first = rowIdempotencyKey(IMPORT_KEY, 'start-a1-tisch');
    const again = rowIdempotencyKey(IMPORT_KEY, 'start-a1-tisch');
    expect(first).toBe(again);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // A different import run, or a different row, must not collide.
    expect(rowIdempotencyKey(IMPORT_KEY, 'start-a1-apfel')).not.toBe(first);
    expect(rowIdempotencyKey('22222222-2222-4222-8222-222222222222', 'start-a1-tisch')).not.toBe(
      first,
    );
  });

  it('passes the same idempotency key on a retry of the same confirmed import', async () => {
    const bytes = csvFile([{}]);
    const first = makeHarness();
    await confirm(first, bytes);
    const second = makeHarness();
    await confirm(second, bytes);
    const keyOf = (harness: ReturnType<typeof makeHarness>) =>
      harness.writeStore.createCard.mock.calls[0]![0].idempotencyKey;
    expect(keyOf(first)).toBe(keyOf(second));
  });

  it('reports an already-applied import as idempotent, creating nothing', async () => {
    const harness = makeHarness({
      createCard: () => ({
        status: 'idempotent',
        cardId: '00000000-0000-4000-8000-000000000001',
        cardVersionId: '00000000-0000-4000-8000-000000000002',
      }),
    });
    const result = await confirm(harness, csvFile([{}]));
    if (result.status !== 'idempotent')
      throw new Error(`expected idempotent, got ${result.status}`);
    expect(result.created).toBe(0);
    expect(result.outcomes[0]!.reason).toBe('already_applied');
  });

  it('propagates forbidden from the canonical store without writing further rows', async () => {
    const harness = makeHarness({ createCard: () => ({ status: 'forbidden' }) });
    const result = await confirm(harness, csvFile([{}, { lemma: 'Stuhl' }]));
    expect(result.status).toBe('forbidden');
    expect(harness.writeStore.createCard).toHaveBeenCalledTimes(1);
  });

  it('never requests a published status — imported content stays draft', async () => {
    const harness = makeHarness();
    await confirm(harness, csvFile([{}]));
    const call = harness.writeStore.createCard.mock.calls[0]![0] as unknown as Record<
      string,
      unknown
    >;
    // Status is not caller-controlled at all: createCard always writes a draft.
    expect(Object.keys(call)).toEqual(['packId', 'content', 'idempotencyKey', 'actorUserId']);
    expect(JSON.stringify(call)).not.toContain('published');
  });

  it('accepts the generated template as a valid importable file', async () => {
    const harness = makeHarness();
    const bytes = Buffer.from(buildCsvTemplate({ withExample: true }), 'utf8');
    const result = await confirm(harness, bytes);
    if (result.status !== 'applied') throw new Error('expected applied');
    expect(result.created).toBe(1);
  });
});
