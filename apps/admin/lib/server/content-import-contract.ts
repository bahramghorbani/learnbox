import type { CardContentInput } from './postgres-content-packs-write-store';

/**
 * Phase 1 / Milestone 1.3 — the canonical CSV/XLSX import contract.
 *
 * This module is the SINGLE source of truth for the import template. The downloadable template,
 * the parser's header mapping, the row validator and the Admin UI column help all derive from
 * `IMPORT_COLUMNS` below, so the template can never drift from what the importer actually accepts.
 *
 * Required columns are exactly the fields the CANONICAL card model itself requires
 * (`validateWordCard` + `validateLearningVocabularyItem` in `@learnbox/content-models`):
 *
 *   lemma                  — card.lemma must be non-empty
 *   persian_meanings       — at least one non-empty meaning
 *   simple_german_definition
 *   grammar_note
 *   topic_tags             — at least one non-empty tag
 *   difficulty             — integer 1..5
 *   visual_concept         — both visual fields are required together
 *   image_prompt
 *   source_reference       — provenance.sourceReference must be non-empty
 *
 * Everything else is optional because the canonical model treats it as optional. Missing optional
 * educational fields stay missing: M1.3 is standard import only and never invents content.
 */

export type ImportColumnKey =
  | 'lemma'
  | 'article'
  | 'part_of_speech'
  | 'essential_inflection'
  | 'pronunciation_ipa'
  | 'persian_meanings'
  | 'example_german'
  | 'example_persian'
  | 'simple_german_definition'
  | 'grammar_note'
  | 'topic_tags'
  | 'difficulty'
  | 'cefr'
  | 'visual_concept'
  | 'image_prompt'
  | 'source_reference';

export interface ImportColumn {
  key: ImportColumnKey;
  /** Persian header shown in the template and the Admin UI. */
  label: string;
  required: boolean;
  /** Short help text, also written into the template's example row comment column. */
  hint: string;
  /** Example value used by the downloadable example template. */
  example: string;
}

/**
 * Multi-value columns (meanings, tags) accept these separators: ASCII semicolon and pipe plus the
 * Persian semicolon (U+061B) and Arabic comma (U+060C), which is what a Persian-authored
 * spreadsheet actually contains — the template examples use U+061B.
 */
export const MULTI_VALUE_SEPARATOR = /[;|\u061b\u060c]/;

export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  {
    key: 'lemma',
    label: 'واژهٔ آلمانی',
    required: true,
    hint: 'بدون حرف تعریف؛ حرف تعریف ستون جداگانه دارد.',
    example: 'Tisch',
  },
  {
    key: 'article',
    label: 'حرف تعریف',
    required: false,
    hint: 'der / die / das',
    example: 'der',
  },
  {
    key: 'part_of_speech',
    label: 'نقش دستوری',
    required: false,
    hint: 'noun / verb / adjective / adverb / phrase / other',
    example: 'noun',
  },
  {
    key: 'essential_inflection',
    label: 'جمع / صرف',
    required: false,
    hint: 'مثلاً «die Tische».',
    example: 'die Tische',
  },
  {
    key: 'pronunciation_ipa',
    label: 'تلفظ (IPA)',
    required: false,
    hint: 'مثلاً /tɪʃ/',
    example: '/tɪʃ/',
  },
  {
    key: 'persian_meanings',
    label: 'معنی فارسی',
    required: true,
    hint: 'چند معنی را با «؛» یا «|» جدا کنید.',
    example: 'میز؛ میزکار',
  },
  {
    key: 'example_german',
    label: 'مثال آلمانی',
    required: false,
    hint: 'اگر مثال می‌دهید، ترجمهٔ فارسی آن هم لازم است.',
    example: 'Der Tisch ist groß.',
  },
  {
    key: 'example_persian',
    label: 'ترجمهٔ مثال',
    required: false,
    hint: 'ترجمهٔ فارسی همان مثال آلمانی.',
    example: 'میز بزرگ است.',
  },
  {
    key: 'simple_german_definition',
    label: 'تعریف سادهٔ آلمانی',
    required: true,
    hint: 'یک جملهٔ کوتاه و ساده به آلمانی.',
    example: 'Ein Möbel zum Arbeiten und Essen.',
  },
  {
    key: 'grammar_note',
    label: 'یادداشت دستوری',
    required: true,
    hint: 'نکتهٔ دستوری کوتاه.',
    example: 'Maskulin, Plural mit -e.',
  },
  {
    key: 'topic_tags',
    label: 'برچسب موضوعی',
    required: true,
    hint: 'حداقل یک برچسب؛ چندتایی با «؛» یا «|».',
    example: 'wohnen؛ moebel',
  },
  {
    key: 'difficulty',
    label: 'درجهٔ سختی',
    required: true,
    hint: 'عدد صحیح بین ۱ تا ۵.',
    example: '2',
  },
  {
    key: 'cefr',
    label: 'سطح CEFR',
    required: false,
    hint: 'A1/A2/B1/B2/C1/C2 — خالی بماند، سطح بسته استفاده می‌شود.',
    example: 'A1',
  },
  {
    key: 'visual_concept',
    label: 'مفهوم بصری',
    required: true,
    hint: 'تصویر باید چه چیزی را نشان دهد.',
    example: 'Ein Holztisch mit zwei Stühlen.',
  },
  {
    key: 'image_prompt',
    label: 'راهنمای تصویر',
    required: true,
    hint: 'توصیف کوتاه برای ساخت تصویر.',
    example: 'simple illustration of a wooden table',
  },
  {
    key: 'source_reference',
    label: 'منبع',
    required: true,
    hint: 'مرجع یا منبع تهیهٔ محتوا.',
    example: 'Goethe A1 Wortliste',
  },
];

export const REQUIRED_COLUMN_KEYS: readonly ImportColumnKey[] = IMPORT_COLUMNS.filter(
  (column) => column.required,
).map((column) => column.key);

const BY_LABEL = new Map<string, ImportColumnKey>();
const BY_KEY = new Map<string, ImportColumnKey>();
for (const column of IMPORT_COLUMNS) {
  BY_LABEL.set(normalizeHeader(column.label), column.key);
  BY_KEY.set(column.key, column.key);
}

/**
 * Normalizes a header cell so that a file saved from Excel still maps cleanly: Persian/Arabic
 * digit and letter variants are folded, zero-width marks dropped, whitespace collapsed.
 */
export function normalizeHeader(value: string): string {
  return value
    .replace(/[\u200c\u200e\u200f\ufeff]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Resolves a header cell to a canonical column key, accepting either the Persian label or the key. */
export function resolveColumnKey(header: string): ImportColumnKey | undefined {
  const normalized = normalizeHeader(header);
  return BY_LABEL.get(normalized) ?? BY_KEY.get(normalized.replace(/[\s-]+/g, '_'));
}

/** Folds Persian/Arabic-Indic digits to ASCII so «۲» is accepted for difficulty. */
export function foldDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

export function splitMultiValue(value: string): string[] {
  return value
    .split(MULTI_VALUE_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export interface RowIssue {
  field: string;
  message: string;
}

export interface MappedRow {
  /** 1-based row number in the SOURCE FILE (header is row 1), so errors are correctable at source. */
  rowNumber: number;
  content?: CardContentInput;
  issues: RowIssue[];
}

/**
 * Maps one parsed record to the canonical `CardContentInput`, reporting shape-level problems.
 *
 * This only enforces what the canonical model itself requires plus format rules it cannot express
 * (enum spelling, numeric range). Deeper content rules stay with the canonical validator, which
 * runs against the built item — never duplicated here.
 */
export function mapRow(
  record: Partial<Record<ImportColumnKey, string>>,
  rowNumber: number,
): MappedRow {
  const issues: RowIssue[] = [];
  const text = (key: ImportColumnKey) => (record[key] ?? '').trim();

  for (const key of REQUIRED_COLUMN_KEYS) {
    if (!text(key)) {
      const column = IMPORT_COLUMNS.find((entry) => entry.key === key)!;
      issues.push({ field: key, message: `«${column.label}» الزامی است و خالی است.` });
    }
  }

  const article = text('article');
  if (article && !['der', 'die', 'das'].includes(article.toLowerCase())) {
    issues.push({ field: 'article', message: 'حرف تعریف باید der، die یا das باشد.' });
  }

  const partOfSpeech = text('part_of_speech');
  const allowedPos = ['noun', 'verb', 'adjective', 'adverb', 'phrase', 'other'];
  if (partOfSpeech && !allowedPos.includes(partOfSpeech.toLowerCase())) {
    issues.push({
      field: 'part_of_speech',
      message: `نقش دستوری باید یکی از ${allowedPos.join('، ')} باشد.`,
    });
  }

  const cefr = text('cefr');
  if (cefr && !/^(A1|A2|B1|B2|C1|C2)$/i.test(cefr)) {
    issues.push({ field: 'cefr', message: 'سطح CEFR باید A1 تا C2 باشد.' });
  }

  const difficultyRaw = foldDigits(text('difficulty'));
  const difficulty = Number(difficultyRaw);
  if (difficultyRaw && (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5)) {
    issues.push({ field: 'difficulty', message: 'درجهٔ سختی باید عددی صحیح بین ۱ و ۵ باشد.' });
  }

  const germanExample = text('example_german');
  const persianExample = text('example_persian');
  if (Boolean(germanExample) !== Boolean(persianExample)) {
    issues.push({
      field: 'example',
      message: 'مثال باید هم متن آلمانی و هم ترجمهٔ فارسی داشته باشد.',
    });
  }

  const persianMeanings = splitMultiValue(text('persian_meanings'));
  if (text('persian_meanings') && persianMeanings.length === 0) {
    issues.push({ field: 'persian_meanings', message: 'حداقل یک معنی فارسی معتبر لازم است.' });
  }
  const topicTags = splitMultiValue(text('topic_tags'));
  if (text('topic_tags') && topicTags.length === 0) {
    issues.push({ field: 'topic_tags', message: 'حداقل یک برچسب موضوعی معتبر لازم است.' });
  }

  if (issues.length > 0) return { rowNumber, issues };

  return {
    rowNumber,
    issues: [],
    content: {
      lemma: text('lemma'),
      article: article ? article.toLowerCase() : undefined,
      partOfSpeech: partOfSpeech ? partOfSpeech.toLowerCase() : undefined,
      essentialInflection: text('essential_inflection') || undefined,
      pronunciationIpa: text('pronunciation_ipa') || undefined,
      persianMeanings,
      examples: germanExample ? [{ german: germanExample, persian: persianExample }] : [],
      simpleGermanDefinition: text('simple_german_definition'),
      grammarNote: text('grammar_note'),
      topicTags,
      difficulty,
      cefr: cefr ? cefr.toUpperCase() : undefined,
      visualConcept: text('visual_concept'),
      imagePrompt: text('image_prompt'),
      sourceReference: text('source_reference'),
    },
  };
}

function csvCell(value: string): string {
  return /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Builds the downloadable template from `IMPORT_COLUMNS`, so it is generated from the contract
 * rather than maintained as a separate specification that could drift.
 */
export function buildCsvTemplate(options: { withExample: boolean }): string {
  const header = IMPORT_COLUMNS.map((column) =>
    csvCell(column.required ? `${column.label} *` : column.label),
  ).join(',');
  if (!options.withExample) return `\ufeff${header}\n`;
  const example = IMPORT_COLUMNS.map((column) => csvCell(column.example)).join(',');
  return `\ufeff${header}\n${example}\n`;
}
