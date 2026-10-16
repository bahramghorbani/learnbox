import { startAuthentication } from '@simplewebauthn/browser';

/**
 * Inline step-up re-authentication for guarded Admin mutations.
 *
 * Content writes require an authentication newer than `recentAuthenticationMs` (5 minutes, server
 * policy — unchanged here). A form that takes longer than that to fill therefore gets `428
 * reauthentication_required`, and before this module the content workspaces could only tell the
 * operator to sign in again, which discarded everything typed.
 *
 * The flow is the one `SliderManagerPanel` and `SplashReplacementPanel` already use — `options` →
 * WebAuthn assertion → `verify` — extracted so every caller shares it instead of copying it:
 *
 *   - the ceremony is single-flight, so two mutations refused at once raise ONE passkey prompt;
 *   - a refused request is retried AT MOST once, with the identical body and idempotency key, so a
 *     mutation the server already applied cannot be applied twice and no retry loop can form;
 *   - nothing navigates or reloads, so unsaved form state, selection and workflow context survive.
 */

export type StepUpOutcome =
  'not-required' | 'confirmed' | 'cancelled' | 'failed' | 'session-expired';

const csrfCookieName = '__Host-learnbox_admin_csrf';

/**
 * The CSRF token every guarded mutation must send. Exported because the retry contract below is
 * only safe if the caller builds its `init` the same way this module does — three private copies of
 * the same cookie read is three places for that header to drift.
 */
export function readCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === csrfCookieName) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/**
 * The idempotency key that makes the single retry safe: the server either applies the mutation
 * once or reports it as already applied. Lives here, next to the retry it protects.
 */
export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (part) => {
    const random = Math.floor(Math.random() * 16);
    const value = part === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/** A user who dismisses the system passkey sheet is not an error; only the browser says which. */
function isCancellation(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')
  );
}

/** A read refused for an authentication reason; `message` is the operator-facing text. */
export class StepUpRefusedError extends Error {
  override name = 'StepUpRefusedError';
}

/** What the operator is told. Every message states that the typed data is still there. */
export function stepUpMessage(outcome: StepUpOutcome): string {
  switch (outcome) {
    case 'cancelled':
      return 'تأیید هویت لغو شد؛ داده‌های واردشده حفظ شده است — برای ذخیره دوباره تلاش کنید.';
    case 'session-expired':
      return 'نشست شما منقضی شده است؛ در تب دیگری دوباره وارد شوید، سپس همین‌جا دوباره ذخیره کنید (داده‌ها حفظ شده است).';
    case 'failed':
      return 'تأیید هویت دوباره ناموفق بود؛ داده‌های واردشده حفظ شده است — دوباره تلاش کنید.';
    default:
      return 'احراز هویت مجدد لازم است؛ داده‌های واردشده حفظ شده است — یک‌بار دیگر تلاش کنید.';
  }
}

let inFlight: Promise<StepUpOutcome> | undefined;

/**
 * Runs the passkey step-up once, even if several refused mutations ask for it at the same time.
 * Returns `confirmed` only when the server accepted the assertion (HTTP 204).
 */
export async function requestStepUpReauth(): Promise<StepUpOutcome> {
  if (inFlight) return inFlight;
  const ceremony = (async (): Promise<StepUpOutcome> => {
    const csrfToken = readCsrfToken();
    if (!csrfToken) return 'failed';
    try {
      const optionsResponse = await fetch('/api/auth/reauth/options', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (optionsResponse.status === 401) return 'session-expired';
      if (!optionsResponse.ok) return 'failed';
      const optionsJSON = await optionsResponse.json();
      const assertion = await startAuthentication({ optionsJSON });
      const verifyResponse = await fetch('/api/auth/reauth/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-learnbox-csrf-token': csrfToken,
        },
        body: JSON.stringify({ response: assertion }),
      });
      if (verifyResponse.status === 401) return 'session-expired';
      if (verifyResponse.status !== 204) return 'failed';
      return 'confirmed';
    } catch (error) {
      return isCancellation(error) ? 'cancelled' : 'failed';
    }
  })();
  inFlight = ceremony;
  try {
    return await ceremony;
  } finally {
    inFlight = undefined;
  }
}

/**
 * `fetch` that answers a 428 with an inline step-up and one identical retry.
 *
 * `init` is reused verbatim on the retry — same body, same `idempotency-key` — which is what makes
 * the retry safe: the server either applies the mutation once or reports it as already applied.
 */
export async function fetchWithStepUp(
  input: string,
  init: RequestInit,
): Promise<{ response: Response; stepUp: StepUpOutcome }> {
  const response = await fetch(input, init);
  if (response.status !== 428) return { response, stepUp: 'not-required' };
  const stepUp = await requestStepUpReauth();
  if (stepUp !== 'confirmed') return { response, stepUp };
  // Exactly one retry. A second 428 is reported to the operator instead of prompting again.
  return { response: await fetch(input, init), stepUp };
}

/**
 * What to tell the operator when a guarded mutation did not go through for an authentication
 * reason. `undefined` means "this was not a step-up problem" and the caller maps the status itself.
 *
 * A second 428 AFTER a confirmed passkey is reported rather than re-prompted: `fetchWithStepUp`
 * retries exactly once, which is what keeps a stale clock or a revoked credential from turning
 * into an endless prompt loop. Shared by every screen with a guarded mutation, because this is the
 * one message that must not drift between them.
 */
export function stepUpRefusal(stepUp: StepUpOutcome, httpStatus: number): string | undefined {
  if (stepUp !== 'not-required' && stepUp !== 'confirmed') return stepUpMessage(stepUp);
  if (httpStatus === 428) {
    return 'تأیید هویت ثبت شد، اما سرور همچنان احراز هویت تازه می‌خواهد؛ داده‌های واردشده حفظ شده است — یک‌بار دیگر تلاش کنید.';
  }
  return undefined;
}

/**
 * `stepUpRefusal` for a READ. The mutation wording ("your typed data is kept — save again") is wrong
 * here: nothing was typed and nothing is saved, so the operator is told the read did not happen.
 */
export function stepUpReadRefusal(stepUp: StepUpOutcome, httpStatus: number): string | undefined {
  switch (stepUp) {
    case 'cancelled':
      return 'تأیید هویت لغو شد؛ برای دیدن وضعیت رسانه، دوباره تأیید هویت کنید.';
    case 'session-expired':
      return 'نشست شما منقضی شده است؛ در تب دیگری دوباره وارد شوید، سپس وضعیت رسانه را دوباره بخوانید.';
    case 'failed':
      return 'تأیید هویت ناموفق بود؛ وضعیت رسانه خوانده نشد — دوباره تلاش کنید.';
    default:
      return httpStatus === 428
        ? 'تأیید هویت ثبت شد، اما سرور همچنان احراز هویت تازه می‌خواهد؛ وضعیت رسانه خوانده نشد — دوباره تلاش کنید.'
        : undefined;
  }
}
