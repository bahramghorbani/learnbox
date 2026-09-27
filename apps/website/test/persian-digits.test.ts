import { describe, expect, it } from 'vitest';

import { toPersianDigits } from '../app/persian-digits';

describe('Persian numeral formatting (M-L2)', () => {
  it('renders Latin digits as Persian digits', () => {
    expect(toPersianDigits(0)).toBe('۰');
    expect(toPersianDigits(3)).toBe('۳');
    expect(toPersianDigits(10)).toBe('۱۰');
    expect(toPersianDigits(123)).toBe('۱۲۳');
  });

  it('leaves non-numeral text untouched', () => {
    expect(toPersianDigits(3)).not.toContain('3');
  });

  it('keeps negative and larger counts truthful', () => {
    expect(toPersianDigits(-1)).toBe('-۱');
    expect(toPersianDigits(1000)).toBe('۱۰۰۰');
  });
});
