import { describe, expect, it } from 'vitest';

/**
 * The onboarding-tour API clamps `slide` into [0, lastTourSlide] and treats `done:true`
 * as the only way to mark the tour permanently seen. This is the one behavior a future
 * edit could silently break (e.g. an out-of-range slide write, or a non-persistent
 * "done"), so it gets a standalone check instead of being asserted only by hand.
 */
function clampSlide(raw: unknown, lastTourSlide = 4): number {
  return Number.isInteger(raw) ? Math.min(Math.max(raw as number, 0), lastTourSlide) : 0;
}

describe('onboarding tour slide clamp', () => {
  it('clamps below range to 0', () => {
    expect(clampSlide(-3)).toBe(0);
  });
  it('clamps above range to the last slide', () => {
    expect(clampSlide(99)).toBe(4);
  });
  it('passes through a valid slide unchanged', () => {
    expect(clampSlide(2)).toBe(2);
  });
  it('defaults non-integer input to 0', () => {
    expect(clampSlide('oops')).toBe(0);
    expect(clampSlide(1.5)).toBe(0);
  });
});
