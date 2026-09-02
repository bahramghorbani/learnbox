type OwnerOtpEnvironment = {
  LEARNBOX_OTP_TEST_UI_ENABLED?: string;
  VERCEL_ENV?: string;
  APP_ENV?: string;
  NODE_ENV?: string;
};

export function isOwnerOtpTestEnabled(environment: OwnerOtpEnvironment): boolean {
  if (environment.LEARNBOX_OTP_TEST_UI_ENABLED !== 'true') return false;
  if (environment.VERCEL_ENV === 'preview' || environment.APP_ENV === 'staging') return true;
  return environment.VERCEL_ENV === undefined && environment.NODE_ENV === 'development';
}
