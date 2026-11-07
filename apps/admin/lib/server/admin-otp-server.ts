import { Pool } from 'pg';

import { readAdminAuthConfig, readAdminOtpConfig } from './admin-auth-policy';
import { readAdminDatabaseConfig } from './admin-database';
import { getSharedAdminDatabasePool } from './admin-database-pool';
import { createOtpRequestRoute, createOtpVerifyRoute } from './admin-otp-routes';
import { PostgresAdminOtpStore } from './postgres-admin-otp-store';
import { PostgresOwnerAuthStore } from './postgres-owner-auth-store';
import { smsIrVerificationClientFromEnvironment } from './admin-sms-ir-client';

export function getAdminOtpServer() {
  const env = process.env;
  const authConfig = readAdminAuthConfig(env);
  const otpConfig = readAdminOtpConfig(env);

  if (!otpConfig.enabled) {
    return {
      requestRoute: createOtpRequestRoute({ authConfig, otpConfig }),
      verifyRoute: createOtpVerifyRoute({ authConfig, otpConfig }),
    };
  }

  if (!authConfig.enabled) {
    throw new Error('OTP login requires LEARNBOX_ADMIN_PASSKEY_ENABLED=true for origin config.');
  }

  const pool = getSharedAdminDatabasePool(
    readAdminDatabaseConfig(env),
    (config) => new Pool(config),
  );
  const otpStore = new PostgresAdminOtpStore(pool);
  const sessionStore = new PostgresOwnerAuthStore(pool);
  const smsClient = smsIrVerificationClientFromEnvironment(env);

  return {
    requestRoute: createOtpRequestRoute({ authConfig, otpConfig, store: otpStore, smsClient }),
    verifyRoute: createOtpVerifyRoute({ authConfig, otpConfig, otpStore, sessionStore }),
  };
}
