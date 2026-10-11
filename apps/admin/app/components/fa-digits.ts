/**
 * Persian digit presentation, matching the frozen prototype's `fa()` helper.
 *
 * Shared because every Admin surface that prints a count needs it and two copies of a digit map
 * is two places for a locale to drift. Formatting is presentation only: canonical values stay
 * Latin-digit numbers everywhere else.
 */

const FA_DIGITS = [
  '\u06f0',
  '\u06f1',
  '\u06f2',
  '\u06f3',
  '\u06f4',
  '\u06f5',
  '\u06f6',
  '\u06f7',
  '\u06f8',
  '\u06f9',
];

export function fa(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => FA_DIGITS[Number(digit)]);
}

/** Thousands-separated, then localised \u2014 so 12438 reads \u06f1\u06f2,\u06f4\u06f3\u06f8. */
export function faNum(value: number): string {
  return fa(value.toLocaleString('en-US'));
}
