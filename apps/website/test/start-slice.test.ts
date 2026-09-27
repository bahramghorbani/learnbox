import { describe, expect, it } from 'vitest';

import { resolveStartSliceItem, selectTodayStartSession } from '../app/start-slice';

describe('canonical Start slice resolver', () => {
  it('resolves canonical items across both repository bundles and fails closed for unknown keys', () => {
    expect(resolveStartSliceItem('start-a1-haus')?.german).toBe('Haus');
    expect(resolveStartSliceItem('start-a1-gehen')?.german).toBe('gehen');
    expect(resolveStartSliceItem('__proto__')).toBeUndefined();
    expect(resolveStartSliceItem('constructor')).toBeUndefined();
  });

  it('keeps the local daily slice deterministic', () => {
    expect(
      selectTodayStartSession(new Date('2026-09-20T12:00:00.000Z')).map((item) => item.id),
    ).toEqual(selectTodayStartSession(new Date('2026-09-20T00:00:00.000Z')).map((item) => item.id));
  });
});
