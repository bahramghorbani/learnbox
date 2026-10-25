/**
 * Normalizes numeral text a human actually types into a plain ASCII integer string.
 *
 * Price and other numeric admin inputs use `inputMode="numeric"` text fields (not
 * `type="number"`) so RTL/Persian layout works; on a Persian keyboard that happily produces
 * Persian (۰-۹) or Arabic-Indic (٠-٩) digits, and people type thousands separators (٬ , ،  space).
 * `Number('۱۰۰۰۰')` is NaN, so without this a perfectly valid price typed in Persian digits
 * fails validation with a generic "invalid" error that never says why.
 *
 * This only normalizes digit *characters*; it does not validate range or sign — callers still
 * run their own `Number.isInteger` / bounds checks on the result.
 */
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function toAsciiDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (char) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(char);
    if (persianIndex >= 0) return String(persianIndex);
    return String(ARABIC_INDIC_DIGITS.indexOf(char));
  });
}

/** Strips thousands separators (٬ ، , and spaces) after digit normalization. */
export function normalizeIntegerInput(value: string): string {
  return toAsciiDigits(value).replace(/[٬،,\s]/g, '');
}
