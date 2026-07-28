import { describe, expect, it } from 'vitest';

import {
  loadPersonalVocabulary,
  savePersonalVocabulary,
  type PersonalVocabularyStorage,
} from '../src/index.js';

class MemoryStorage implements PersonalVocabularyStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('personal vocabulary storage', () => {
  it('round-trips valid device-only personal additions', () => {
    const storage = new MemoryStorage();
    savePersonalVocabulary(storage, 'personal-words:v1', [
      { german: 'der Alltag', persian: 'زندگی روزمره', progress: 0 },
    ]);

    expect(loadPersonalVocabulary(storage, 'personal-words:v1')).toEqual([
      { german: 'der Alltag', persian: 'زندگی روزمره', progress: 0 },
    ]);
  });

  it('ignores malformed entries and clears an empty local collection', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'personal-words:v1',
      JSON.stringify([
        { german: 'die Reise', persian: 'سفر', progress: 25 },
        { german: '', persian: 'نامعتبر', progress: 0 },
        { german: 'bad progress', persian: 'نامعتبر', progress: 101 },
      ]),
    );

    expect(loadPersonalVocabulary(storage, 'personal-words:v1')).toEqual([
      { german: 'die Reise', persian: 'سفر', progress: 25 },
    ]);
    savePersonalVocabulary(storage, 'personal-words:v1', []);
    expect(storage.getItem('personal-words:v1')).toBeNull();
  });
});
