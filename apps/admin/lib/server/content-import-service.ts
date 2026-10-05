import { createHash } from 'node:crypto';

import {
  buildCardContent,
  deriveContentId,
  type CardContentInput,
  type PostgresContentPacksWriteStore,
} from './postgres-content-packs-write-store';
import { mapRow, type RowIssue } from './content-import-contract';
import { parseImportFile, ImportParseError, type ParsedSheet } from './content-import-parse';
import { validateLearningVocabularyItem } from '@learnbox/content-models';

/**
 * Phase 1 / Milestone 1.3 — standard CSV/XLSX import analysis and confirmed application.
 *
 * Analysis is a PURE DRY RUN: it opens no transaction and performs no write. It reuses the exact
 * canonical pieces M1.2 established — `deriveContentId` for identity, `buildCardContent` plus the
 * canonical `validateLearningVocabularyItem` for content rules — so the preview cannot disagree
 * with what the write will later accept.
 *
 * Duplicate identity is NOT invented here. LearnBox already has a reliable content identity:
 * `cards.content_id` (pack prefix + CEFR + normalized German headword) carries a UNIQUE
 * constraint, and M1.2's `createCard` already rejects a colliding id with `content_id_exists`.
 * Import classifies rows by that same key.
 */

export type RowClassification = 'new' | 'duplicate_in_file' | 'existing' | 'invalid';

export interface AnalyzedRow {
  rowNumber: number;
  lemma: string;
  contentId?: string;
  classification: RowClassification;
  issues: RowIssue[];
  content?: CardContentInput;
  /** For duplicate_in_file: the earlier row in the same upload that already claimed this id. */
  duplicateOfRow?: number;
}

export interface ImportAnalysis {
  packId: string;
  filename: string;
  fileKind: 'csv' | 'xlsx';
  totalRows: number;
  counts: Record<RowClassification, number>;
  rows: AnalyzedRow[];
  unknownHeaders: string[];
  missingRequiredColumns: string[];
  /** Stable fingerprint of exactly the rows that WILL be written; binds confirm to this preview. */
  importableFingerprint: string;
  importableCount: number;
}

export type AnalyzeResult =
  | { status: 'ok'; analysis: ImportAnalysis }
  | { status: 'unreadable'; message: string }
  | { status: 'not_found' };

export interface ImportApplyOutcome {
  rowNumber: number;
  contentId: string;
  status: 'created' | 'skipped';
  reason?: string;
  cardId?: string;
}

export type ApplyResult =
  | { status: 'forbidden' }
  | { status: 'not_found' }
  | { status: 'stale'; message: string }
  | { status: 'idempotent'; created: number; skipped: number; outcomes: ImportApplyOutcome[] }
  | { status: 'applied'; created: number; skipped: number; outcomes: ImportApplyOutcome[] };

type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = { query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult> };
type DatabasePool = Queryable;

function fileKindOf(filename: string, bytes: Buffer): 'csv' | 'xlsx' {
  return bytes.length > 4 && bytes.readUInt32LE(0) === 0x04034b50 ? 'xlsx' : 'csv';
}

/**
 * Derives a deterministic uuid v5 idempotency key for one imported row.
 *
 * Keying on (import key, content id) means a retried confirm maps every row to the SAME key the
 * first attempt used, so M1.2's existing `mutation_log` replay turns the retry into a no-op
 * instead of a second card. Retry safety therefore reuses the established mechanism rather than
 * adding an import-specific one.
 */
export function rowIdempotencyKey(importKey: string, contentId: string): string {
  const digest = createHash('sha1')
    .update(`learnbox-import:${importKey}:${contentId}`)
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export class ContentImportService {
  constructor(
    private readonly pool: DatabasePool,
    private readonly writeStore: Pick<PostgresContentPacksWriteStore, 'createCard'>,
  ) {}

  /**
   * Parses, validates and classifies an upload WITHOUT writing anything.
   *
   * The only database access is a read of existing `content_id`s for conflict detection.
   */
  async analyze(input: {
    packId: string;
    filename: string;
    bytes: Buffer;
  }): Promise<AnalyzeResult> {
    const packRow = await this.pool.query('SELECT id, target_cefr FROM packs WHERE id = $1', [
      input.packId,
    ]);
    if (packRow.rows.length === 0) return { status: 'not_found' };
    const packCefr = String(packRow.rows[0]!.target_cefr ?? 'A1');

    let sheet: ParsedSheet;
    try {
      sheet = parseImportFile(input.filename, input.bytes);
    } catch (error) {
      if (error instanceof ImportParseError)
        return { status: 'unreadable', message: error.message };
      return { status: 'unreadable', message: 'فایل قابل خواندن نیست.' };
    }

    const rows: AnalyzedRow[] = [];
    const claimedInFile = new Map<string, number>();
    const candidateIds: string[] = [];

    sheet.records.forEach((record, index) => {
      // +2: the header occupies row 1, so the first data record is row 2 in the source file.
      const rowNumber = index + 2;
      const mapped = mapRow(record, rowNumber);
      const lemma = (record.lemma ?? '').trim();

      if (sheet.missingRequiredColumns.length > 0 || !mapped.content) {
        rows.push({ rowNumber, lemma, classification: 'invalid', issues: mapped.issues });
        return;
      }

      const cefr = mapped.content.cefr ?? packCefr;
      const contentId = deriveContentId(input.packId, cefr, mapped.content.lemma);

      // Canonical content rules — the same validator the write path runs, never a parallel copy.
      const candidate = buildCardContent(
        { ...mapped.content, cefr },
        { contentId, version: 1, media: [], status: 'draft' },
      );
      let canonicalIssues: RowIssue[] = [];
      try {
        canonicalIssues = validateLearningVocabularyItem(candidate);
      } catch {
        canonicalIssues = [{ field: 'content', message: 'محتوای این سطر معتبر نیست.' }];
      }
      if (canonicalIssues.length > 0) {
        rows.push({
          rowNumber,
          lemma,
          contentId,
          classification: 'invalid',
          issues: canonicalIssues,
        });
        return;
      }

      const earlier = claimedInFile.get(contentId);
      if (earlier !== undefined) {
        rows.push({
          rowNumber,
          lemma,
          contentId,
          classification: 'duplicate_in_file',
          issues: [
            {
              field: 'lemma',
              message: `این واژه در سطر ${earlier} همین فایل هم آمده است.`,
            },
          ],
          duplicateOfRow: earlier,
        });
        return;
      }
      claimedInFile.set(contentId, rowNumber);
      candidateIds.push(contentId);
      rows.push({
        rowNumber,
        lemma,
        contentId,
        classification: 'new',
        issues: [],
        content: { ...mapped.content, cefr },
      });
    });

    // Conflict detection against canonical data, by the same unique key the DB enforces.
    if (candidateIds.length > 0) {
      const existing = await this.pool.query(
        'SELECT content_id FROM cards WHERE content_id = ANY($1::text[])',
        [candidateIds],
      );
      const existingIds = new Set(existing.rows.map((row) => String(row.content_id)));
      for (const row of rows) {
        if (row.classification === 'new' && row.contentId && existingIds.has(row.contentId)) {
          row.classification = 'existing';
          row.issues = [
            {
              field: 'lemma',
              message: 'کارتی با همین شناسه از قبل در این بسته وجود دارد و بازنویسی نمی‌شود.',
            },
          ];
          delete row.content;
        }
      }
    }

    if (sheet.missingRequiredColumns.length > 0) {
      for (const row of rows) {
        row.classification = 'invalid';
        if (row.issues.length === 0) {
          row.issues = [{ field: 'file', message: 'ستون‌های الزامی در فایل موجود نیست.' }];
        }
        delete row.content;
      }
    }

    const counts: Record<RowClassification, number> = {
      new: 0,
      duplicate_in_file: 0,
      existing: 0,
      invalid: 0,
    };
    for (const row of rows) counts[row.classification] += 1;

    const importable = rows.filter((row) => row.classification === 'new' && row.content);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify(
          importable.map((row) => [row.contentId, row.content?.lemma, row.content?.difficulty]),
        ),
      )
      .digest('hex');

    return {
      status: 'ok',
      analysis: {
        packId: input.packId,
        filename: input.filename,
        fileKind: fileKindOf(input.filename, input.bytes),
        totalRows: rows.length,
        counts,
        rows,
        unknownHeaders: sheet.unknownHeaders,
        missingRequiredColumns: sheet.missingRequiredColumns,
        importableFingerprint: fingerprint,
        importableCount: importable.length,
      },
    };
  }

  /**
   * Applies a CONFIRMED import.
   *
   * Re-analyses the uploaded bytes server-side and refuses when the fingerprint no longer matches
   * what the Admin previewed, so a confirm can never write rows the owner did not see. Only rows
   * classified `new` are written; invalid, duplicate and conflicting rows are reported, never
   * written, and never overwrite an existing card.
   *
   * Each row is applied through M1.2's `createCard`, which keeps authorization, canonical
   * validation, draft status, audit logging and per-row transactional integrity in ONE place.
   */
  async apply(input: {
    packId: string;
    filename: string;
    bytes: Buffer;
    actorUserId: string;
    importKey: string;
    expectedFingerprint: string;
  }): Promise<ApplyResult> {
    const analyzed = await this.analyze(input);
    if (analyzed.status === 'not_found') return { status: 'not_found' };
    if (analyzed.status === 'unreadable') {
      return { status: 'stale', message: analyzed.message };
    }
    if (analyzed.analysis.importableFingerprint !== input.expectedFingerprint) {
      return {
        status: 'stale',
        message: 'فایل یا محتوای بسته از زمان پیش‌نمایش تغییر کرده است. دوباره پیش‌نمایش بگیرید.',
      };
    }

    const outcomes: ImportApplyOutcome[] = [];
    let created = 0;
    let skipped = 0;
    let replayed = 0;

    for (const row of analyzed.analysis.rows) {
      if (row.classification !== 'new' || !row.content || !row.contentId) {
        skipped += 1;
        outcomes.push({
          rowNumber: row.rowNumber,
          contentId: row.contentId ?? '',
          status: 'skipped',
          reason: row.classification,
        });
        continue;
      }
      const result = await this.writeStore.createCard({
        packId: input.packId,
        content: row.content,
        idempotencyKey: rowIdempotencyKey(input.importKey, row.contentId),
        actorUserId: input.actorUserId,
      });
      if (result.status === 'forbidden') return { status: 'forbidden' };
      if (result.status === 'applied') {
        created += 1;
        outcomes.push({
          rowNumber: row.rowNumber,
          contentId: row.contentId,
          status: 'created',
          cardId: result.cardId,
        });
      } else if (result.status === 'idempotent') {
        replayed += 1;
        outcomes.push({
          rowNumber: row.rowNumber,
          contentId: row.contentId,
          status: 'skipped',
          reason: 'already_applied',
          cardId: result.cardId,
        });
      } else {
        skipped += 1;
        outcomes.push({
          rowNumber: row.rowNumber,
          contentId: row.contentId,
          status: 'skipped',
          reason: result.status === 'conflict' ? result.reason : result.status,
        });
      }
    }

    // Every importable row replayed → this exact confirmed import already ran.
    if (created === 0 && replayed > 0) {
      return { status: 'idempotent', created, skipped: skipped + replayed, outcomes };
    }
    return { status: 'applied', created, skipped: skipped + replayed, outcomes };
  }
}
