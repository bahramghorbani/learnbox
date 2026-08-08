export type LearnerAuthMode = 'local-prototype' | 'server-otp';

export function resolveLearnerAuthMode(value?: string): LearnerAuthMode {
  return value === 'true' ? 'server-otp' : 'local-prototype';
}
