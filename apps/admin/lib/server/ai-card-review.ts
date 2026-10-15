import { IMPORT_COLUMNS, type ImportColumnKey } from './content-import-contract';

/**
 * Independent AI review and bounded automatic repair of generated cards.
 *
 * The generator and the reviewer are two separate provider calls with different system prompts
 * and, by default, different models. The reviewer receives ONLY the cards (plus the target level
 * and the pack title): never the generator's system prompt, the Admin's original request or any
 * generator reasoning, so it judges the content rather than the intent behind it.
 *
 * Nothing in this module can approve or publish a card. A `passed` review only means the card
 * starts SELECTED in the Admin's acceptance list; acceptance still creates draft content, and
 * approval and publication remain human decisions in the existing review lifecycle.
 */

export type ReviewSeverity = 'critical' | 'major' | 'minor';

/** Where a finding came from: the AI reviewer, or LearnBox's own canonical validator. */
export type ReviewFindingSource = 'reviewer' | 'validator';

export interface ReviewFinding {
  field: string;
  severity: ReviewSeverity;
  /** Persian explanation of what is wrong. */
  reason: string;
  /** Persian or German suggestion for the fix; may be empty. */
  suggestion: string;
  source: ReviewFindingSource;
}

/**
 * Review state of one generated row.
 *
 *  - pending       awaiting (re-)review
 *  - passed        no critical or major finding remains (minor findings are kept and shown)
 *  - needs_repair  critical/major findings, a repair round is still available
 *  - unresolved    critical/major findings remain after the last allowed repair round
 *  - excluded      duplicate or existing card; replaced, never reviewed
 */
export type ReviewState = 'pending' | 'passed' | 'needs_repair' | 'unresolved' | 'excluded';

export interface RowReview {
  state: ReviewState;
  findings: ReviewFinding[];
  repairRounds: number;
  /** True once the row content was replaced by an automatic repair. */
  repaired: boolean;
  reviewerModel?: string;
  repairModel?: string;
  /** First generated version, kept when a repair replaces the content, so nothing is hidden. */
  original?: Partial<Record<ImportColumnKey, string>>;
  /**
   * Every review pass in order (first review, then one per repair round), so the findings an
   * automatic repair fixed stay visible after the content was replaced.
   */
  history?: ReviewPass[];
  /**
   * The canonical draft version this row became, recorded on acceptance. The Admin review queue
   * uses it to show these findings beside that exact version (and never beside a later edit).
   */
  cardVersionId?: string;
  excludedReason?: 'duplicate' | 'existing';
}

export interface ReviewPass {
  /** 0 = first review; n = review after the n-th repair. */
  round: number;
  findings: ReviewFinding[];
}

export type GeneratedRow = Partial<Record<ImportColumnKey, string>> & { _review?: RowReview };

export interface QualityReport {
  /** Target card count of the approved plan. Never lowered to make a pack publishable. */
  target: number;
  /** Every row the generator returned, including replaced and failed ones. */
  totalGenerated: number;
  /** Rows that are valid, new and passed review: these start selected. */
  ready: number;
  /** Passed on the first review, without repair. */
  passedFirstReview: number;
  /** Passed only after an automatic repair. */
  repaired: number;
  /** Critical or major findings remain after the last repair round. */
  withIssues: number;
  /** Fails LearnBox's canonical validation. */
  invalid: number;
  /** Duplicates within this job or of an existing card. */
  duplicates: number;
  /** Ready rows that still carry minor findings worth a human glance. */
  minorWarnings: number;
  /** Not yet reviewed (legacy rows or an interrupted job). */
  unreviewed: number;
  /** How many more ready cards are needed to reach the target. */
  shortfall: number;
}

const SEVERITIES: readonly ReviewSeverity[] = ['critical', 'major', 'minor'];
const MAX_REASON_CHARS = 600;
const MAX_FINDINGS_PER_CARD = 12;

export const REVIEW_FIELD_KEYS: readonly ImportColumnKey[] = IMPORT_COLUMNS.map(
  (column) => column.key,
);

export const REVIEWER_SYSTEM_PROMPT = [
  'You are an independent senior editor of German vocabulary cards for Persian-speaking learners.',
  'You did NOT write these cards. Do not assume they are correct: verify every field yourself.',
  'Check each card for:',
  '- Standard German (Hochdeutsch): spelling, capitalisation, umlauts/ß, lemma form.',
  '- Part of speech, and for nouns the correct article (der/die/das) and plural.',
  '- Verb forms and other essential inflection; IPA plausibility.',
  '- Persian meaning: accurate, natural Persian, the primary sense first; no meaning shift.',
  '- CEFR: the word and the example must suit the stated target level.',
  '- German example: grammatical, natural, uses the headword in the stated meaning.',
  '- Persian example: a faithful, natural translation of the German example.',
  '- Simple German definition and Persian grammar note: correct and consistent with the meaning.',
  '- User-visible teaching explanations, especially grammar_note, must be fluent Persian. German',
  '  specialist terms (for example, Nominativ or Neutrum) and German examples are allowed inside',
  '  that Persian explanation; a German-only explanation is a major issue.',
  '- Consistency between all fields (meaning, example, definition and image must agree).',
  '- Image fields: depict the meaning, no text or letters in the image, no brand logos,',
  '  culturally appropriate for Iranian learners, no unsafe or offensive content.',
  'Severity:',
  '- critical: teaches something wrong (wrong article, wrong meaning, wrong lemma, wrong POS,',
  '  ungrammatical example, mistranslated example, level far from target, unsafe image brief).',
  '- major: misleading or clearly poor (awkward/unnatural Persian, partial meaning, weak example,',
  '  inconsistent fields, wrong plural or inflection, wrong IPA).',
  '- minor: style or optional improvement only.',
  'Reply with a single JSON object and no other text:',
  '{"reviews":[{"index":<card index>,"findings":[{"field":"<field key>","severity":"critical|major|minor",',
  '"reason":"<Persian explanation>","suggestion":"<concrete fix>"}]}]}',
  'Return one entry for EVERY card index you received. Use an empty findings array only when the',
  'card is fully correct. Field keys must be the card keys you received.',
].join('\n');

export const REPAIR_SYSTEM_PROMPT = [
  'You correct German vocabulary cards for Persian-speaking learners.',
  'Each card comes with editor findings. Fix exactly the problems described, keep every correct',
  'field unchanged, and keep the same headword unless a finding says the headword itself is wrong.',
  'Follow standard German and natural Persian. Example sentences: supply BOTH German and Persian.',
  'Every user-visible grammar_note or teaching explanation must be fluent Persian; German specialist',
  'terms and German examples are allowed inside that Persian explanation, but never German-only text.',
  'Every field must be a string; never return null.',
  'Reply with a single JSON object and no other text:',
  '{"cards":[{"index":<card index>,"card":{<all card keys>}}]}',
  'Return one entry for every card index you received.',
].join('\n');

/** Cards as the reviewer sees them: content fields only, no provenance of the generator. */
export function buildReviewPrompt(input: {
  packTitle: string;
  cefr: string;
  cards: Array<{ index: number; row: GeneratedRow }>;
}): string {
  return [
    `Pack title: ${input.packTitle}`,
    `Target CEFR level: ${input.cefr}`,
    'Cards:',
    JSON.stringify(
      input.cards.map(({ index, row }) => ({ index, card: contentFields(row) })),
      null,
      0,
    ),
  ].join('\n');
}

export function buildRepairPrompt(input: {
  packTitle: string;
  cefr: string;
  cards: Array<{ index: number; row: GeneratedRow }>;
}): string {
  return [
    `Pack title: ${input.packTitle}`,
    `Target CEFR level: ${input.cefr}`,
    `Card keys: ${JSON.stringify(REVIEW_FIELD_KEYS)}`,
    'Cards with findings:',
    JSON.stringify(
      input.cards.map(({ index, row }) => ({
        index,
        card: contentFields(row),
        findings: (row._review?.findings ?? [])
          .filter((finding) => finding.severity !== 'minor')
          .map(({ field, severity, reason, suggestion }) => ({
            field,
            severity,
            reason,
            suggestion,
          })),
      })),
      null,
      0,
    ),
  ].join('\n');
}

export function contentFields(row: GeneratedRow): Partial<Record<ImportColumnKey, string>> {
  const result: Partial<Record<ImportColumnKey, string>> = {};
  for (const key of REVIEW_FIELD_KEYS) {
    const value = row[key];
    if (typeof value === 'string' && value) result[key] = value;
  }
  return result;
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maximum);
}

/**
 * Parses the reviewer reply. Returns undefined when the reply is not a usable review at all, so
 * the caller treats it as a provider failure rather than silently passing every card.
 */
export function parseReviewReply(
  parsed: Record<string, unknown> | undefined,
  expectedIndexes: readonly number[],
): Map<number, ReviewFinding[]> | undefined {
  if (!parsed || !Array.isArray(parsed.reviews)) return undefined;
  const expected = new Set(expectedIndexes);
  const result = new Map<number, ReviewFinding[]>();
  for (const entry of parsed.reviews) {
    if (typeof entry !== 'object' || entry === null) continue;
    const index = Number((entry as { index?: unknown }).index);
    if (!Number.isSafeInteger(index) || !expected.has(index) || result.has(index)) continue;
    const rawFindings = (entry as { findings?: unknown }).findings;
    if (!Array.isArray(rawFindings)) continue;
    const findings: ReviewFinding[] = [];
    for (const raw of rawFindings.slice(0, MAX_FINDINGS_PER_CARD)) {
      if (typeof raw !== 'object' || raw === null) continue;
      const source = raw as Record<string, unknown>;
      const severityRaw = text(source.severity, 20).toLowerCase();
      // An unknown severity is treated as major: an unclassifiable problem is not a style nit.
      const severity = (SEVERITIES as readonly string[]).includes(severityRaw)
        ? (severityRaw as ReviewSeverity)
        : 'major';
      const reason = text(source.reason, MAX_REASON_CHARS);
      if (!reason) continue;
      findings.push({
        field: text(source.field, 60) || 'card',
        severity,
        reason,
        suggestion: text(source.suggestion, MAX_REASON_CHARS),
        source: 'reviewer',
      });
    }
    result.set(index, findings);
  }
  return result.size > 0 ? result : undefined;
}

/** Parses the repair reply into replacement content per card index. */
export function parseRepairReply(
  parsed: Record<string, unknown> | undefined,
  expectedIndexes: readonly number[],
): Map<number, Partial<Record<ImportColumnKey, string>>> | undefined {
  if (!parsed || !Array.isArray(parsed.cards)) return undefined;
  const expected = new Set(expectedIndexes);
  const result = new Map<number, Partial<Record<ImportColumnKey, string>>>();
  for (const entry of parsed.cards) {
    if (typeof entry !== 'object' || entry === null) continue;
    const index = Number((entry as { index?: unknown }).index);
    const card = (entry as { card?: unknown }).card;
    if (!Number.isSafeInteger(index) || !expected.has(index) || result.has(index)) continue;
    if (typeof card !== 'object' || card === null) continue;
    const record: Partial<Record<ImportColumnKey, string>> = {};
    for (const key of REVIEW_FIELD_KEYS) {
      const value = (card as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) record[key] = value.trim();
      else if (typeof value === 'number' && Number.isFinite(value)) record[key] = String(value);
    }
    if (record.lemma) result.set(index, record);
  }
  return result.size > 0 ? result : undefined;
}

export function hasBlockingFinding(findings: readonly ReviewFinding[]): boolean {
  return findings.some((finding) => finding.severity !== 'minor');
}

/** The state a reviewed row moves to, given its findings and the remaining repair budget. */
export function stateAfterReview(
  findings: readonly ReviewFinding[],
  repairRounds: number,
  maxRepairRounds: number,
): ReviewState {
  if (!hasBlockingFinding(findings)) return 'passed';
  return repairRounds < maxRepairRounds ? 'needs_repair' : 'unresolved';
}

/** Canonical validator issues expressed as findings, so they flow through the same repair path. */
export function validatorFindings(issues: ReadonlyArray<{ field: string; message: string }>) {
  return issues.map<ReviewFinding>((issue) => ({
    field: issue.field,
    severity: 'critical',
    reason: issue.message,
    suggestion: '',
    source: 'validator',
  }));
}

export type RowClassificationLite = 'new' | 'duplicate_in_file' | 'existing' | 'invalid';

/** Whether a row is ready: valid, new and passed review (legacy unreviewed rows count as ready). */
export function isReadyRow(row: GeneratedRow, classification: RowClassificationLite): boolean {
  if (classification !== 'new') return false;
  const review = row._review;
  return !review || review.state === 'passed';
}

export function buildQualityReport(
  rows: readonly GeneratedRow[],
  classifications: readonly RowClassificationLite[],
  target: number,
): QualityReport {
  const report: QualityReport = {
    target,
    totalGenerated: rows.length,
    ready: 0,
    passedFirstReview: 0,
    repaired: 0,
    withIssues: 0,
    invalid: 0,
    duplicates: 0,
    minorWarnings: 0,
    unreviewed: 0,
    shortfall: 0,
  };
  rows.forEach((row, index) => {
    const classification = classifications[index] ?? 'invalid';
    const review = row._review;
    if (classification === 'duplicate_in_file' || classification === 'existing') {
      report.duplicates += 1;
      return;
    }
    if (!review || review.state === 'pending') report.unreviewed += 1;
    if (isReadyRow(row, classification)) {
      report.ready += 1;
      if (review?.state === 'passed') {
        if (review.repaired) report.repaired += 1;
        else report.passedFirstReview += 1;
        if (review.findings.length > 0) report.minorWarnings += 1;
      }
      return;
    }
    if (classification === 'invalid') {
      report.invalid += 1;
      return;
    }
    if (review?.state === 'unresolved' || review?.state === 'needs_repair') report.withIssues += 1;
  });
  report.shortfall = Math.max(0, target - report.ready);
  return report;
}

export type RowReviewSummary = Pick<
  RowReview,
  'state' | 'findings' | 'repairRounds' | 'repaired'
> & {
  history: ReviewPass[];
};

/** Maps generated-row order (one-based) to UI review state without leaking prompts or model output. */
export function reviewSummaryByRow(
  rows: readonly GeneratedRow[],
): Record<number, RowReviewSummary> {
  const result: Record<number, RowReviewSummary> = {};
  rows.forEach((row, index) => {
    if (!row._review) return;
    const { state, findings, repairRounds, repaired, history } = row._review;
    result[index + 1] = { state, findings, repairRounds, repaired, history: history ?? [] };
  });
  return result;
}

/**
 * What the Admin review queue shows for one AI-generated version. `resolved` findings were raised
 * in an earlier pass and are gone after automatic repair; `remaining` are the final pass's findings
 * (only minor ones can remain on an accepted card, since unresolved cards cannot be accepted).
 */
export interface QueueAiReview {
  state: ReviewState;
  repaired: boolean;
  repairRounds: number;
  reviewerModel: string | null;
  repairModel: string | null;
  findings: Array<ReviewFinding & { status: 'resolved' | 'remaining'; round: number }>;
}

export function queueAiReviewOf(review: RowReview): QueueAiReview {
  const history =
    review.history && review.history.length > 0
      ? review.history
      : [{ round: review.repairRounds, findings: review.findings }];
  const last = history.length - 1;
  return {
    state: review.state,
    repaired: review.repaired,
    repairRounds: review.repairRounds,
    reviewerModel: review.reviewerModel ?? null,
    repairModel: review.repairModel ?? null,
    findings: history.flatMap((pass, position) =>
      pass.findings.map((finding) => ({
        ...finding,
        round: pass.round,
        status: position === last ? ('remaining' as const) : ('resolved' as const),
      })),
    ),
  };
}
