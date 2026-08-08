export type ChallengeResponse = {
  challengeId: string;
  expiresAt: string;
  resendAvailableAt: string;
};

type OwnerOtpEnvironment = {
  LEARNBOX_OTP_TEST_UI_ENABLED?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
};

export function isOwnerOtpTestEnabled(environment: OwnerOtpEnvironment): boolean {
  if (environment.LEARNBOX_OTP_TEST_UI_ENABLED !== 'true') return false;
  if (environment.VERCEL_ENV === 'preview') return true;
  return environment.VERCEL_ENV === undefined && environment.NODE_ENV === 'development';
}

export function isOtpVerificationSuccess(status: number): boolean {
  return status === 204;
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

export function otpErrorMessage(status: number, code?: string): string {
  if (code === 'request_invalid') return 'شمارهٔ موبایل را کامل و درست وارد کنید.';
  if (status === 429 || code === 'request_limited') {
    return 'تعداد درخواست‌ها زیاد شده است؛ کمی صبر کنید و دوباره تلاش کنید.';
  }
  if (code === 'verification_failed') {
    return 'کد واردشده درست نیست یا اعتبار آن تمام شده است.';
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
