import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';

import { MobileIdentityService } from '../../api/dist/auth/mobile-identity.service.js';
import { MobileSessionContract } from '../../api/dist/auth/mobile-session.js';
import { OtpRequestService } from '../../api/dist/auth/otp-request.service.js';
import { PostgresMobileIdentityStore } from '../../api/dist/auth/postgres-mobile-identity.store.js';
import { PostgresOtpChallengeStore } from '../../api/dist/auth/postgres-otp-challenge.store.js';
import { SmsIrVerificationClient } from '../../api/dist/auth/sms-ir-verification.client.js';
import { requireVerifiedDatabaseTls } from '../../api/dist/database/migration-runner.js';

import type { MobileAuthHttpDependencies } from './mobile-auth-http';
import { hashOtpClientIp } from './otp-runtime';

type Environment = Record<string, string | undefined>;
export type MobileAuthRuntimeConfig = {
  databaseUrl: string;
  otpSecret: string;
  sessionSecret: string;
  sms: { apiKey: string; codeParameterName: string; templateId: number };
};

export function readMobileAuthRuntimeConfig(
  environment: Environment,
): MobileAuthRuntimeConfig | null {
  if (environment.MOBILE_AUTH_ENABLED !== 'true' || environment.SMS_IR_ENABLED !== 'true')
    return null;
  const databaseUrl = environment.DATABASE_URL ?? '';
  const otpSecret = environment.LEARNBOX_OTP_SECRET ?? '';
  const sessionSecret = environment.LEARNBOX_MOBILE_SESSION_SECRET ?? '';
  const apiKey = environment.SMS_IR_API_KEY ?? '';
  const codeParameterName = environment.SMS_IR_CODE_PARAMETER_NAME ?? '';
  const templateId = Number(environment.SMS_IR_TEMPLATE_ID);
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) return null;
  if (otpSecret.length < 32 || sessionSecret.length < 32 || !apiKey.trim()) return null;
  if (!Number.isSafeInteger(templateId) || templateId < 1) return null;
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(codeParameterName)) return null;
  return {
    databaseUrl,
    otpSecret,
    sessionSecret,
    sms: { apiKey, codeParameterName, templateId },
  };
}

type MobileAuthGlobal = typeof globalThis & {
  learnboxMobileAuthPool?: { databaseUrl: string; pool: Pool };
};

export function mobileAuthHttpDependenciesFromEnvironment(
  environment: Environment = process.env,
): MobileAuthHttpDependencies | null {
  const config = readMobileAuthRuntimeConfig(environment);
  if (!config) return null;
  const pool = mobileAuthPool(config.databaseUrl);
  const session = new MobileSessionContract({
    audience: 'learnbox-mobile',
    clock: { now: () => new Date() },
    key: config.sessionSecret,
    random: { bytes: randomBytes },
  });
  const identity = new MobileIdentityService({
    clock: { now: () => new Date() },
    otpSecret: config.otpSecret,
    session,
    store: new PostgresMobileIdentityStore(pool, config.otpSecret),
  });
  const requestService = new OtpRequestService({
    store: new PostgresOtpChallengeStore(pool),
    delivery: new SmsIrVerificationClient(config.sms),
    secret: config.otpSecret,
  });
  return {
    hashClientIp: (clientIp) => hashOtpClientIp(config.otpSecret, clientIp),
    requestChallenge: (input) => requestService.request(input),
    verify: (input) => identity.verify(input),
    refresh: (input) => identity.refresh(input),
    revoke: async (accessToken) => {
      const verification = session.verifyAccessToken(accessToken);
      if (verification.status !== 'valid') return false;
      const result = await pool.query(
        `UPDATE mobile_learner_sessions
            SET revoked_at = now(), revoked_reason = 'device_logout'
          WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
            AND absolute_expires_at > now() AND idle_expires_at > now()
        RETURNING id`,
        [verification.claims.sid, verification.claims.sub],
      );
      return result.rowCount === 1;
    },
  };
}

function mobileAuthPool(databaseUrl: string): Pool {
  const shared = globalThis as MobileAuthGlobal;
  if (shared.learnboxMobileAuthPool?.databaseUrl === databaseUrl)
    return shared.learnboxMobileAuthPool.pool;
  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(databaseUrl),
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  shared.learnboxMobileAuthPool = { databaseUrl, pool };
  return pool;
}
