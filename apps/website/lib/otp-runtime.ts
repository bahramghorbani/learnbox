import { createHmac } from 'node:crypto';
import { Pool } from 'pg';

import { OtpRequestService } from '../../api/dist/auth/otp-request.service.js';
import { OtpVerificationService } from '../../api/dist/auth/otp-verification.service.js';
import { PostgresOtpChallengeStore } from '../../api/dist/auth/postgres-otp-challenge.store.js';
import { SmsIrVerificationClient } from '../../api/dist/auth/sms-ir-verification.client.js';
import { requireVerifiedDatabaseTls } from '../../api/dist/database/migration-runner.js';

import type { OtpHttpDependencies } from './otp-http';
import { createLearnerSession } from './server-session';

type OtpRuntimeEnvironment = Record<string, string | undefined>;

export type OtpRuntimeConfig = {
  databaseUrl: string;
  otpSecret: string;
  sms: {
    apiKey: string;
    codeParameterName: string;
    templateId: number;
  };
};

export function readOtpRuntimeConfig(environment: OtpRuntimeEnvironment): OtpRuntimeConfig | null {
  if (environment.SMS_IR_ENABLED !== 'true') return null;

  const databaseUrl = environment.DATABASE_URL ?? '';
  const otpSecret = environment.LEARNBOX_OTP_SECRET ?? '';
  const apiKey = environment.SMS_IR_API_KEY ?? '';
  const codeParameterName = environment.SMS_IR_CODE_PARAMETER_NAME ?? '';
  const templateId = Number(environment.SMS_IR_TEMPLATE_ID);

  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) return null;
  if (otpSecret.length < 32 || !apiKey.trim()) return null;
  if (!Number.isSafeInteger(templateId) || templateId < 1) return null;
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(codeParameterName)) return null;

  return {
    databaseUrl,
    otpSecret,
    sms: { apiKey, codeParameterName, templateId },
  };
}

export function hashOtpClientIp(secret: string, clientIp: string): string {
  if (secret.length < 32 || !clientIp || clientIp.length > 128) {
    throw new Error('OTP client IP hash input is invalid.');
  }
  return createHmac('sha256', secret).update(`ip:${clientIp}`).digest('base64url');
}

type OtpGlobal = typeof globalThis & {
  learnboxOtpPool?: { databaseUrl: string; pool: Pool };
};

export function otpHttpDependenciesFromEnvironment(
  environment: OtpRuntimeEnvironment = process.env,
): OtpHttpDependencies | null {
  const config = readOtpRuntimeConfig(environment);
  if (!config) return null;

  const pool = otpPool(config.databaseUrl);
  const store = new PostgresOtpChallengeStore(pool);
  const requestService = new OtpRequestService({
    store,
    delivery: new SmsIrVerificationClient(config.sms),
    secret: config.otpSecret,
  });
  const verificationService = new OtpVerificationService({ store, secret: config.otpSecret });

  return {
    hashClientIp: (clientIp) => hashOtpClientIp(config.otpSecret, clientIp),
    requestChallenge: (input) => requestService.request(input),
    verifyChallenge: (input) => verificationService.verify(input),
    createSession: (subject) => createLearnerSession(subject),
  };
}

function otpPool(databaseUrl: string): Pool {
  const shared = globalThis as OtpGlobal;
  if (shared.learnboxOtpPool?.databaseUrl === databaseUrl) return shared.learnboxOtpPool.pool;

  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(databaseUrl),
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  shared.learnboxOtpPool = { databaseUrl, pool };
  return pool;
}
