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

function readCsrfToken(): string | undefined {
  const prefix = `${csrfCookieName}=`;
  return document.cookie
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length);
}

/** A user who dismisses the system passkey sheet is not an error; only the browser says which. */
function isCancellation(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')
  );
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
