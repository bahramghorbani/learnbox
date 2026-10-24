import { describe, expect, it } from 'vitest';

import { normalizeIntegerInput, toAsciiDigits } from '../lib/digits';

describe('digit normalization', () => {
  it('converts Persian digits to ASCII', () => {
    expect(toAsciiDigits('۱۰۰۰۰')).toBe('10000');
  });

  it('converts Arabic-Indic digits to ASCII', () => {
    expect(toAsciiDigits('١٠٠٠٠')).toBe('10000');
  });

  it('leaves ASCII digits untouched', () => {
    expect(toAsciiDigits('10000')).toBe('10000');
  });

  it('strips Persian thousands separators and spaces', () => {
    expect(normalizeIntegerInput('۱۰٬۰۰۰')).toBe('10000');
    expect(normalizeIntegerInput('10,000')).toBe('10000');
    expect(normalizeIntegerInput('10 000')).toBe('10000');
    expect(normalizeIntegerInput('۱۰،۰۰۰')).toBe('10000');
  });

  it('round-trips a plain ASCII integer unchanged', () => {
    expect(normalizeIntegerInput('10000')).toBe('10000');
  });
});
