export interface PersonalVocabularyEntry {
  german: string;
  persian: string;
  progress: number;
}

export interface PersonalVocabularyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isPersonalVocabularyEntry(value: unknown): value is PersonalVocabularyEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.german === 'string' &&
    entry.german.trim().length > 0 &&
    entry.german.length <= 200 &&
    typeof entry.persian === 'string' &&
    entry.persian.trim().length > 0 &&
    entry.persian.length <= 200 &&
    typeof entry.progress === 'number' &&
    Number.isFinite(entry.progress) &&
    entry.progress >= 0 &&
    entry.progress <= 100
  );
}

/** Reads only well-formed local additions; malformed device data never blocks learning. */
export function loadPersonalVocabulary(
  storage: PersonalVocabularyStorage,
  key: string,
): PersonalVocabularyEntry[] {
  const raw = storage.getItem(key);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPersonalVocabularyEntry) : [];
  } catch {
    return [];
  }
}

/** Stores personal additions on the current device only; callers own future authenticated sync. */
export function savePersonalVocabulary(
  storage: PersonalVocabularyStorage,
  key: string,
  entries: PersonalVocabularyEntry[],
): void {
  const validEntries = entries.filter(isPersonalVocabularyEntry);
  if (validEntries.length === 0) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify(validEntries));
}
