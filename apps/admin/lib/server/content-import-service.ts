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
  /**
   * For `existing`: the canonical card this row conflicts with. Present so the Admin can
   * explicitly select the row and have it become a NEW DRAFT VERSION on that card. Absent
   * means the row can never be applied as an override.
   */
  existingCardId?: string;
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
  /** `versioned` = a new draft version was added to an existing card by explicit selection. */
  status: 'created' | 'versioned' | 'skipped';
  reason?: string;
  cardId?: string;
}

export type ApplyResult =
  | { status: 'forbidden' }
  | { status: 'not_found' }
  | { status: 'stale'; message: string }
  | {
      status: 'idempotent';
      created: number;
      versioned: number;
      skipped: number;
      outcomes: ImportApplyOutcome[];
    }
  | {
      status: 'applied';
      created: number;
      versioned: number;
      skipped: number;
      outcomes: ImportApplyOutcome[];
    };

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
export function rowIdempotencyKey(
  importKey: string,
  contentId: string,
  operation: 'create' | 'version' = 'create',
): string {
  const digest = createHash('sha1')
    .update(`learnbox-import:${operation}:${importKey}:${contentId}`)
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
    private readonly writeStore: Pick<PostgresContentPacksWriteStore, 'createCard' | 'editCard'>,
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
        'SELECT id, content_id FROM cards WHERE content_id = ANY($1::text[])',
        [candidateIds],
      );
      // A conflict is only selectable when the row carries a usable card id; anything else stays
      // a plain skip rather than becoming an override target with a bogus id.
      const existingCardIds = new Map(
        existing.rows
          .filter((row) => typeof row.id === 'string' && row.id !== '')
          .map((row) => [String(row.content_id), String(row.id)]),
      );
      const conflictingIds = new Set(existing.rows.map((row) => String(row.content_id)));
      for (const row of rows) {
        if (row.classification !== 'new' || !row.contentId) continue;
        if (!conflictingIds.has(row.contentId)) continue;
        const cardId = existingCardIds.get(row.contentId);
        row.classification = 'existing';
        // Content is deliberately KEPT: the Admin may explicitly select this row, which adds a
        // new DRAFT VERSION to the existing card. Nothing happens to it unless selected.
        row.existingCardId = cardId;
        row.issues = [
          {
            field: 'lemma',
            message: cardId
              ? 'کارتی با همین شناسه از قبل در این بسته وجود دارد. به‌صورت پیش‌فرض رد می‌شود؛ برای ساخت نسخهٔ پیش‌نویس جدید آن را انتخاب کنید.'
              : 'کارتی با همین شناسه از قبل در این بسته وجود دارد و بازنویسی نمی‌شود.',
          },
        ];
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
    // The fingerprint binds a confirm to this preview. It spans every row that could be written —
    // new rows AND selectable conflicts — so no selection can apply content the Admin never saw.
    const writable = rows.filter(
      (row) =>
        row.content &&
        (row.classification === 'new' || (row.classification === 'existing' && row.existingCardId)),
    );
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify(
          writable.map((row) => [
            row.classification,
            row.contentId,
            row.existingCardId ?? null,
            // The FULL content, not a projection: a confirm must be refused whenever any field
            // the Admin reviewed changed, since an override writes this content onto a real card.
            row.content,
          ]),
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
   * what the Admin previewed, so a confirm can never write rows the owner did not see.
   *
   * Rows classified `new` are created. Conflicting rows are skipped BY DEFAULT and are applied
   * only when the Admin explicitly selects them, in which case they add a new DRAFT VERSION to
   * the existing card. Nothing is ever overwritten in place and nothing is published.
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
    /**
     * Row numbers the Admin EXPLICITLY selected for conflict override. Each becomes a new draft
     * version on the existing card via M1.2's `editCard`. Omitted/empty = every conflict is
     * skipped, which is the default.
     */
    selectedConflictRows?: readonly number[];
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

    // Validate the selection against the FRESH analysis: a row may only be overridden if the
    // server itself just classified it as a conflict with applicable content. Anything else is
    // refused outright rather than silently ignored.
    const selected = new Set(input.selectedConflictRows ?? []);
    if (selected.size > 0) {
      const selectable = new Set(
        analyzed.analysis.rows
          .filter((row) => row.classification === 'existing' && row.existingCardId && row.content)
          .map((row) => row.rowNumber),
      );
      const unselectable = [...selected].filter((rowNumber) => !selectable.has(rowNumber));
      if (unselectable.length > 0) {
        return {
          status: 'stale',
          message: `این سطرها قابل انتخاب نیستند: ${unselectable.join('، ')}. دوباره پیش‌نمایش بگیرید.`,
        };
      }
    }

    const outcomes: ImportApplyOutcome[] = [];
    let created = 0;
    let versioned = 0;
    let skipped = 0;
    let replayed = 0;

    for (const row of analyzed.analysis.rows) {
      // Explicitly selected conflict → NEW DRAFT VERSION on the existing card, through M1.2's
      // canonical edit path. That path leaves a published version untouched and inserts the next
      // version as a draft, so learner-visible content cannot change here.
      if (
        row.classification === 'existing' &&
        selected.has(row.rowNumber) &&
        row.existingCardId &&
        row.content &&
        row.contentId
      ) {
        const edit = await this.writeStore.editCard({
          cardId: row.existingCardId,
          content: row.content,
          idempotencyKey: rowIdempotencyKey(input.importKey, row.contentId, 'version'),
          actorUserId: input.actorUserId,
        });
        if (edit.status === 'forbidden') return { status: 'forbidden' };
        if (edit.status === 'applied') {
          versioned += 1;
          outcomes.push({
            rowNumber: row.rowNumber,
            contentId: row.contentId,
            status: 'versioned',
            cardId: row.existingCardId,
          });
        } else if (edit.status === 'idempotent') {
          replayed += 1;
          outcomes.push({
            rowNumber: row.rowNumber,
            contentId: row.contentId,
            status: 'skipped',
            reason: 'already_applied',
            cardId: row.existingCardId,
          });
        } else {
          skipped += 1;
          outcomes.push({
            rowNumber: row.rowNumber,
            contentId: row.contentId,
            status: 'skipped',
            reason: edit.status === 'conflict' ? edit.reason : edit.status,
          });
        }
        continue;
      }

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

    // Every applicable row replayed → this exact confirmed import already ran.
    if (created === 0 && versioned === 0 && replayed > 0) {
      return { status: 'idempotent', created, versioned, skipped: skipped + replayed, outcomes };
    }
    return { status: 'applied', created, versioned, skipped: skipped + replayed, outcomes };
  }
}
