import {
  createMemoryStorage,
  createResilientStorage,
  type DeviceStorage,
} from '@learnbox/learning-engine';

// Versioned device-local pronunciation preference (M3-S1). The record is a JSON
// object with an explicit numeric version so a future schema can be detected
// instead of misread.
export const soundPreferenceStorageKey = 'learnbox:sound-preference:v1:local-prototype';

export const soundPreferenceRecordVersion = 1 as const;

export type SoundPreferenceDurability = 'durable' | 'session';

// Session fallback keeps the preference usable when persistent browser storage
// is denied; it is per-module so reads and writes share one open session.
let sessionFallback = createMemoryStorage();

function resolveStorage(): DeviceStorage {
  if (typeof window === 'undefined') return sessionFallback;
  try {
    return createResilientStorage(window.localStorage, sessionFallback);
  } catch {
    return sessionFallback;
  }
}

// Reads a stored record. Missing, malformed or unknown-version records recover
// to the safe default (enabled); recovery never rewrites or deletes other keys.
export function parseSoundPreferenceRecord(raw: string | null): boolean {
  if (raw === null) return true;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === 'object' && value !== null) {
      const { version, enabled } = value as { version?: unknown; enabled?: unknown };
      if (version === soundPreferenceRecordVersion) {
        if (enabled === true) return true;
        if (enabled === false) return false;
      }
    }
  } catch {
    // Malformed record: fall through to the safe default.
  }
  return true;
}

export function loadSoundPreference(): boolean {
  try {
    return parseSoundPreferenceRecord(resolveStorage().getItem(soundPreferenceStorageKey));
  } catch {
    return true;
  }
}

// Writes an explicit version-1 record. Durable writes go to the browser storage;
// a denied or failing durable write falls back to the open-session memory store
// and is reported as non-durable so the UI can label it truthfully.
export function saveSoundPreference(enabled: boolean): SoundPreferenceDurability {
  const record = JSON.stringify({ version: soundPreferenceRecordVersion, enabled });
  const storage = resolveStorage();
  let durable = false;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(soundPreferenceStorageKey, record);
      durable = true;
    } catch {
      // Denied or full durable storage: the session fallback below keeps this
      // open session usable and consistent with subsequent reads.
    }
  }
  storage.setItem(soundPreferenceStorageKey, record);
  return durable ? 'durable' : 'session';
}

// Test-only: starts a fresh open session so a denied-storage test cannot leak
// its fallback value into later tests of the same module.
export function resetSoundPreferenceMemory(): void {
  sessionFallback = createMemoryStorage();
}
