/**
 * Formats a count as Persian digits for RTL UI surfaces (M-L2 numeral parity).
 * Keeps the negative sign as-is; only 0-9 are transliterated.
 */
export function toPersianDigits(value: number): string {
  return value
    .toString()
    .replaceAll('0', '۰')
    .replaceAll('1', '۱')
    .replaceAll('2', '۲')
    .replaceAll('3', '۳')
    .replaceAll('4', '۴')
    .replaceAll('5', '۵')
    .replaceAll('6', '۶')
    .replaceAll('7', '۷')
    .replaceAll('8', '۸')
    .replaceAll('9', '۹');
}
