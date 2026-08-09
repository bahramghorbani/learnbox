import { createHmac } from 'node:crypto';
import { Pool } from 'pg';

import { InviteAccessService } from '../../api/dist/alpha/invite-access.service.js';
import { PostgresInviteAccessStore } from '../../api/dist/alpha/postgres-invite-access.store.js';
import { requireVerifiedDatabaseTls } from '../../api/dist/database/migration-runner.js';

import type { InviteCheckOutcome } from '../../api/dist/alpha/invite-access.service.js';
import type { InviteHttpDependencies } from './alpha-http';

type InviteRuntimeEnvironment = Record<string, string | undefined>;

export type InviteRuntimeConfig = {
  databaseUrl: string;
  inviteSecret: string;
  consentVersion: string;
};

export function readInviteRuntimeConfig(
  environment: InviteRuntimeEnvironment,
): InviteRuntimeConfig | null {
  if (environment.LEARNBOX_ALPHA_INVITE_ENABLED !== 'true') return null;

  const databaseUrl = environment.DATABASE_URL ?? '';
  const inviteSecret = environment.LEARNBOX_ALPHA_INVITE_SECRET ?? '';
  const consentVersion = environment.LEARNBOX_ALPHA_CONSENT_VERSION;

  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) return null;
  if (inviteSecret.length < 32) return null;
  if (typeof consentVersion !== 'string' || consentVersion.trim() === '') return null;

  return { databaseUrl, inviteSecret, consentVersion };
}

export function hashInviteIp(secret: string, clientIp: string): string {
  if (secret.length < 32 || !clientIp || clientIp.length > 128) {
    throw new Error('Invite client IP hash input is invalid.');
  }
  return createHmac('sha256', secret).update(`ip:${clientIp}`).digest('base64url');
}

type InviteGlobal = typeof globalThis & {
  learnboxInvitePool?: { databaseUrl: string; pool: Pool };
};

export function inviteHttpDependenciesFromEnvironment(
  environment: InviteRuntimeEnvironment = process.env,
): InviteHttpDependencies | null {
  const config = readInviteRuntimeConfig(environment);
  if (!config) return null;

  const pool = invitePool(config.databaseUrl);
  const store = new PostgresInviteAccessStore(pool);
  const service = new InviteAccessService({ store, secret: config.inviteSecret });

  return {
    hashClientIp: (clientIp) => hashInviteIp(config.inviteSecret, clientIp),
    checkInvite: (input): Promise<InviteCheckOutcome> =>
      service.check({
        code: input.code,
        consentVersion: config.consentVersion,
        ipHash: input.ipHash,
      }),
    consentVersion: config.consentVersion,
  };
}

function invitePool(databaseUrl: string): Pool {
  const shared = globalThis as InviteGlobal;
  if (shared.learnboxInvitePool?.databaseUrl === databaseUrl) {
    return shared.learnboxInvitePool.pool;
  }

  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(databaseUrl),
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  shared.learnboxInvitePool = { databaseUrl, pool };
  return pool;
}
