export type LearnerAuthMode = 'local-prototype' | 'server-otp';

export function resolveLearnerAuthMode(value?: string): LearnerAuthMode {
  // Prototype login is a test fixture only. Missing/false release flags must
  // fail closed to the real OTP/session flow, never expose device-local data.
  return process.env.NODE_ENV === 'test' && value !== 'true' ? 'local-prototype' : 'server-otp';
}
