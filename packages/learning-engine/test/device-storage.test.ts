import { describe, expect, it } from 'vitest';

import { createMemoryStorage, createResilientStorage, type DeviceStorage } from '../src/index.js';

class ThrowingStorage implements DeviceStorage {
  getItem(): string | null {
    throw new Error('storage unavailable');
  }

  setItem(): void {
    throw new Error('storage unavailable');
  }

  removeItem(): void {
    throw new Error('storage unavailable');
  }
}

describe('resilient device storage', () => {
  it('uses durable storage when it is available', () => {
    const primary = createMemoryStorage();
    const storage = createResilientStorage(primary);

    storage.setItem('goal', 'career');
    expect(primary.getItem('goal')).toBe('career');
    expect(storage.getItem('goal')).toBe('career');
  });

  it('falls back in memory without throwing when durable storage is unavailable', () => {
    const storage = createResilientStorage(new ThrowingStorage());

    storage.setItem('goal', 'career');
    expect(storage.getItem('goal')).toBe('career');
    storage.removeItem('goal');
    expect(storage.getItem('goal')).toBeNull();
  });
});
