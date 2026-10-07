import { toPersianDigits } from '../app/persian-digits';

export type ChallengeResponse = {
  challengeId: string;
  expiresAt: string;
  resendAvailableAt: string;
};

export function isOtpVerificationSuccess(status: number): boolean {
  return status === 204;
}

export function rememberOtpChallenge(
  history: readonly ChallengeResponse[],
  next: ChallengeResponse,
): ChallengeResponse[] {
  return [next, ...history.filter((item) => item.challengeId !== next.challengeId)].slice(0, 3);
}

type OtpStatusResponse = { status: number };

export type OtpChallengeVerificationResult<TResponse extends OtpStatusResponse> =
  { outcome: 'success' } | { outcome: 'rejected' } | { outcome: 'terminal'; response: TResponse };

export async function verifyOtpChallenges<TResponse extends OtpStatusResponse>(
  history: readonly ChallengeResponse[],
  verify: (challengeId: string) => Promise<TResponse>,
): Promise<OtpChallengeVerificationResult<TResponse>> {
  for (const challenge of history) {
    const response = await verify(challenge.challengeId);
    if (isOtpVerificationSuccess(response.status)) return { outcome: 'success' };
    if (response.status !== 400) return { outcome: 'terminal', response };
  }
  return { outcome: 'rejected' };
}

export function normalizeOtpDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/\D/g, '');
}

export function validateIranianMobile(value: string): boolean {
  const digits = normalizeOtpDigits(value);
  const national = digits.startsWith('0') ? digits.slice(1) : digits;
  return /^9\d{9}$/.test(national);
}

export function readChallengeResponse(value: unknown): ChallengeResponse | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.challengeId !== 'string' ||
    !/^[a-zA-Z0-9_-]{16,128}$/.test(candidate.challengeId) ||
    !isIsoDate(candidate.expiresAt) ||
    !isIsoDate(candidate.resendAvailableAt)
  ) {
    return null;
  }
  return {
    challengeId: candidate.challengeId,
    expiresAt: candidate.expiresAt,
    resendAvailableAt: candidate.resendAvailableAt,
  };
}

export function otpErrorMessage(status: number, code?: string, retryAfterSeconds?: number): string {
  if (code === 'request_invalid') return 'شمارهٔ موبایل را کامل و درست وارد کنید.';
  if (status === 429 || code === 'request_limited') {
    // Telling the learner how long to wait turns a dead end into a clear instruction (LB-B08).
    if (typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds)) {
      const wait = Math.max(1, Math.ceil(retryAfterSeconds));
      if (wait >= 60) {
        const minutes = Math.ceil(wait / 60);
        return `تعداد درخواست‌ها زیاد شده است؛ حدود ${toPersianDigits(minutes)} دقیقهٔ دیگر دوباره تلاش کنید.`;
      }
      return `تعداد درخواست‌ها زیاد شده است؛ ${toPersianDigits(wait)} ثانیهٔ دیگر دوباره تلاش کنید.`;
    }
    return 'تعداد درخواست‌ها زیاد شده است؛ کمی صبر کنید و دوباره تلاش کنید.';
  }
  if (code === 'verification_failed') {
    return 'کد واردشده درست نیست یا اعتبار آن تمام شده است.';
  }
  // The code was right; the account itself is suspended. Repeating "wrong code" here would send
  // the learner round the loop forever instead of telling them to contact support (M3.1).
  // Keyed on the code alone, never on the 403 status: other refusals also arrive as 403 and must
  // keep their own message.
  if (code === 'account_suspended') {
    return 'حساب شما موقتاً غیرفعال شده است؛ برای بررسی با پشتیبانی تماس بگیرید.';
  }
  if (
    status === 503 ||
    code === 'delivery_unavailable' ||
    code === 'verification_unavailable' ||
    code === 'otp_unavailable'
  ) {
    return 'ارسال پیامک اکنون در دسترس نیست؛ دوباره تلاش کنید.';
  }
  return 'ارتباط با سرویس انجام نشد؛ دوباره تلاش کنید.';
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/**
 * Reads the standard `retry-after` header (seconds) when the server rate-limits a request.
 *
 * Defensive by design: a response may legitimately arrive without a `headers` object (non-standard
 * fetch polyfills and test doubles), and failing to read an optional hint must never break the
 * error path that shows the learner what went wrong.
 */
export function readRetryAfterSeconds(response: Response): number | undefined {
  const header = response?.headers?.get?.('retry-after');
  if (!header) return undefined;
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}
