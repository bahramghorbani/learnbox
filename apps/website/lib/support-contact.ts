/**
 * Learner-facing support contact (LB-B04) and OTP/login escape path (LB-B08).
 *
 * Scope is deliberately narrow: LearnBox exposes a Telegram contact link. There is no ticketing
 * system, no CRM, no support database, no account linking and no authentication via Telegram —
 * those are explicitly out of scope for v1.1.
 *
 * The support identity is the learner-facing bot ONLY. The monitoring bot must never appear in a
 * learner surface, which `telegram-destinations` enforces with a dedicated test.
 */

import { SUPPORT_TELEGRAM_USERNAME, supportTelegramUrl } from './telegram-destinations';

export { SUPPORT_TELEGRAM_USERNAME, supportTelegramUrl };

/** Where a support entry point is offered. Used to keep wording and telemetry-free links honest. */
export type SupportSurface = 'login' | 'profile' | 'privacy';

/**
 * Prefilled text for the support deep link.
 *
 * Telegram's `?text=` only prefills the learner's own message box; it is not transmitted anywhere
 * until the learner presses send. It deliberately contains NO phone number, code, session or other
 * personal data — the learner chooses what to say.
 */
export function supportLinkFor(surface: SupportSurface): string {
  const base = supportTelegramUrl();
  if (surface === 'login') {
    return `${base}?text=${encodeURIComponent('سلام، در ورود به LearnBox مشکل دارم.')}`;
  }
  return base;
}

/** Persian label for each entry point. */
export function supportLabelFor(surface: SupportSurface): string {
  switch (surface) {
    case 'login':
      return 'کد ورود را دریافت نکردید؟ پشتیبانی در تلگرام';
    case 'profile':
      return 'پشتیبانی LearnBox در تلگرام';
    case 'privacy':
      return 'تماس با پشتیبانی';
  }
}

/**
 * True when a support link is safe to render: it must point at the support bot and must not carry
 * anything resembling personal data in the query string.
 */
export function isSafeSupportLink(url: string): boolean {
  if (!url.startsWith(`https://t.me/${SUPPORT_TELEGRAM_USERNAME}`)) return false;
  const decoded = decodeURIComponent(url);
  // No digits that could be a phone number or OTP code.
  if (/\d{4,}/.test(decoded)) return false;
  return true;
}
