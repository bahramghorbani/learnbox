import { randomBytes } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { hashOtpCode, hashOtpPhone } from '../lib/server/admin-otp-challenge';
import { createOtpRequestRoute, createOtpVerifyRoute } from '../lib/server/admin-otp-routes';
import { PostgresAdminOtpStore } from '../lib/server/postgres-admin-otp-store';
import { PostgresOwnerAuthStore } from '../lib/server/postgres-owner-auth-store';

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;

const OTP_SECRET = 'test-secret-at-least-32-characters-long!';
const AUTHORIZED_PHONE = '+989121234567';
const OTHER_PHONE = '+989129999999';
const ORIGIN = 'https://admin.learnbox.app';
const TOKEN_HASH_KEY = 'k'.repeat(32);

const authConfig = {
  enabled: true as const,
  origin: ORIGIN,
  rpId: 'admin.learnbox.app',
  tokenHashKey: TOKEN_HASH_KEY,
};

const otpConfig = {
  enabled: true as const,
  secret: OTP_SECRET,
  authorizedPhoneHash: hashOtpPhone(OTP_SECRET, AUTHORIZED_PHONE),
};

function otpRequest(body: object, cookieHeader = '') {
  return new Request(`${ORIGIN}/api/auth/otp/request`, {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

function otpVerify(body: object, cookieHeader = '') {
  return new Request(`${ORIGIN}/api/auth/otp/verify`, {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

function setCookieValue(response: Response, name: string): string | undefined {
  const all = response.headers.getSetCookie
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') ?? ''];
  const prefix = `${name}=`;
  for (const h of all) {
    const val = h
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(prefix));
    if (val) return val.slice(prefix.length) || undefined;
  }
  return undefined;
}

suite('admin OTP login against real Postgres', () => {
  let root: Pool;
  let pool: Pool;
  let database = '';

  beforeAll(async () => {
    root = new Pool({ connectionString: url, max: 1 });
    root.on('error', () => undefined);
    database = `admin_otp_test_${randomBytes(4).toString('hex')}`;
    await root.query(`CREATE DATABASE ${database}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${database}`;
    pool = new Pool({ connectionString: scoped.toString(), max: 3 });
    pool.on('error', () => undefined);

    // Minimal schema: admin_owner + admin_sessions (FK target), plus the two new OTP tables.
    await pool.query(`
      CREATE TABLE admin_owner (
        singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
        webauthn_user_handle BYTEA NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      INSERT INTO admin_owner (singleton_id, webauthn_user_handle) VALUES (1, '\\xdeadbeef');

      CREATE TABLE admin_sessions (
        token_hash TEXT PRIMARY KEY,
        owner_singleton_id SMALLINT NOT NULL REFERENCES admin_owner(singleton_id) ON DELETE CASCADE,
        csrf_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMPTZ NOT NULL,
        absolute_expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        recent_authenticated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE admin_otp_challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone_hash TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        resend_available_at TIMESTAMPTZ NOT NULL,
        attempt_count INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 5,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (expires_at > created_at),
        CHECK (consumed_at IS NULL OR consumed_at >= created_at)
      );

      CREATE TABLE admin_otp_request_events (
        challenge_id UUID NOT NULL REFERENCES admin_otp_challenges(id) ON DELETE CASCADE,
        phone_hash TEXT NOT NULL,
        ip_hash TEXT NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL
      );
    `);
  });

  afterAll(async () => {
    await pool?.end();
    await root?.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await root?.end();
  });

  it('authorized phone creates a challenge row and calls the SMS client', async () => {
    const sent: { phone: string; code: string }[] = [];
    const smsClient = { sendVerificationCode: vi.fn(async (p: string, c: string) => { sent.push({ phone: p, code: c }); }) };
    const otpStore = new PostgresAdminOtpStore(pool as never);
    const handler = createOtpRequestRoute({ authConfig, otpConfig, store: otpStore as never, smsClient });

    const response = await handler(otpRequest({ phone: '09121234567' }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: 'sent' });
    expect(smsClient.sendVerificationCode).toHaveBeenCalledOnce();
    expect(sent[0]?.phone).toBe(AUTHORIZED_PHONE);
    expect(sent[0]?.code).toMatch(/^\d{5}$/);
    // Raw phone must not appear in the challenge row.
    const rows = await pool.query('SELECT phone_hash FROM admin_otp_challenges');
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0]?.phone_hash).not.toContain('989121234567');
    // The challenge cookie is set.
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('__Host-learnbox_admin_otp_challenge=');
  });

  it('wrong phone returns indistinguishable response and creates no challenge row', async () => {
    const before = await pool.query('SELECT COUNT(*) FROM admin_otp_challenges');
    const smsClient = { sendVerificationCode: vi.fn(async () => {}) };
    const otpStore = new PostgresAdminOtpStore(pool as never);
    const handler = createOtpRequestRoute({ authConfig, otpConfig, store: otpStore as never, smsClient });

    const response = await handler(otpRequest({ phone: OTHER_PHONE }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: 'sent' });
    expect(smsClient.sendVerificationCode).not.toHaveBeenCalled();
    const after = await pool.query('SELECT COUNT(*) FROM admin_otp_challenges');
    expect(Number(after.rows[0]?.count)).toBe(Number(before.rows[0]?.count));
    // No challenge cookie on non-match path.
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).not.toContain('__Host-learnbox_admin_otp_challenge=');
  });

  it('correct code returns 204 and creates an admin_sessions row', async () => {
    // First, request an OTP challenge.
    let capturedCode = '';
    const smsClient = { sendVerificationCode: vi.fn(async (_p: string, c: string) => { capturedCode = c; }) };
    const otpStore = new PostgresAdminOtpStore(pool as never);
    const requestHandler = createOtpRequestRoute({ authConfig, otpConfig, store: otpStore as never, smsClient });
    const requestResponse = await requestHandler(otpRequest({ phone: '09121234567' }));
    expect(requestResponse.status).toBe(202);

    const challengeId = setCookieValue(requestResponse, '__Host-learnbox_admin_otp_challenge');
    expect(challengeId).toBeTruthy();

    // Verify with the captured code.
    const sessionStore = new PostgresOwnerAuthStore(pool as never);
    const verifyHandler = createOtpVerifyRoute({ authConfig, otpConfig, otpStore: otpStore as never, sessionStore });
    const verifyCookie = `__Host-learnbox_admin_otp_challenge=${challengeId}`;
    const verifyResponse = await verifyHandler(otpVerify({ code: capturedCode }, verifyCookie));

    expect(verifyResponse.status).toBe(204);
    const setCookies = verifyResponse.headers.get('set-cookie') ?? '';
    expect(setCookies).toContain('__Host-learnbox_admin_session=');
    expect(setCookies).toContain('__Host-learnbox_admin_csrf=');
    // Challenge cookie must be cleared.
    expect(setCookies).toContain('__Host-learnbox_admin_otp_challenge=;');

    // A session row must exist in admin_sessions.
    const sessions = await pool.query('SELECT token_hash FROM admin_sessions');
    expect(sessions.rows.length).toBeGreaterThan(0);
    // The raw token is never persisted.
    for (const row of sessions.rows) {
      expect(row.token_hash).not.toBe(capturedCode);
    }
  });

  it('wrong code 5 times locks the challenge', async () => {
    let capturedCode = '';
    const smsClient = { sendVerificationCode: vi.fn(async (_p: string, c: string) => { capturedCode = c; }) };
    const otpStore = new PostgresAdminOtpStore(pool as never);
    const requestHandler = createOtpRequestRoute({ authConfig, otpConfig, store: otpStore as never, smsClient });
    const requestResponse = await requestHandler(otpRequest({ phone: '09121234567' }));

    const challengeId = setCookieValue(requestResponse, '__Host-learnbox_admin_otp_challenge');
    expect(challengeId).toBeTruthy();
    expect(capturedCode).toMatch(/^\d{5}$/);

    const wrongCode = capturedCode === '00000' ? '11111' : '00000';
    const sessionStore = new PostgresOwnerAuthStore(pool as never);
    const verifyHandler = createOtpVerifyRoute({ authConfig, otpConfig, otpStore: otpStore as never, sessionStore });
    const verifyCookie = `__Host-learnbox_admin_otp_challenge=${challengeId}`;

    // 5 wrong attempts → locked on the last.
    for (let i = 0; i < 5; i++) {
      const result = await verifyHandler(otpVerify({ code: wrongCode }, verifyCookie));
      if (i < 4) {
        expect(result.status).toBe(401);
      } else {
        expect(result.status).toBe(401); // locked returns 401
        const clearCookie = result.headers.get('set-cookie') ?? '';
        expect(clearCookie).toContain('__Host-learnbox_admin_otp_challenge=;');
      }
    }

    // The correct code now fails because the challenge is locked.
    const afterLock = await verifyHandler(otpVerify({ code: capturedCode }, verifyCookie));
    expect(afterLock.status).toBe(401);
  });

  it('rate-limits after 3 OTP requests for the same phone in the window', async () => {
    // Clear prior events by creating a fresh phone hash set via a different secret to isolate.
    const isolatedSecret = 'isolated-secret-for-rate-limit-test-at-least-32-chars';
    const isolatedPhone = '+989130000001';
    const isolatedOtpConfig = {
      enabled: true as const,
      secret: isolatedSecret,
      authorizedPhoneHash: hashOtpPhone(isolatedSecret, isolatedPhone),
    };
    const otpStore = new PostgresAdminOtpStore(pool as never);
    const makeHandler = () =>
      createOtpRequestRoute({
        authConfig,
        otpConfig: isolatedOtpConfig,
        store: otpStore as never,
        smsClient: { sendVerificationCode: vi.fn(async () => {}) },
      });

    // 3 successful requests.
    for (let i = 0; i < 3; i++) {
      const r = await makeHandler()(otpRequest({ phone: isolatedPhone }));
      expect(r.status).toBe(202);
    }

    // 4th is rate-limited — but response shape is STILL 202 (we hide the limit from the caller).
    const fourth = await makeHandler()(otpRequest({ phone: isolatedPhone }));
    expect(fourth.status).toBe(202);
    await expect(fourth.json()).resolves.toEqual({ status: 'sent' });
    // No challenge cookie set for the rate-limited request.
    const cookie = fourth.headers.get('set-cookie') ?? '';
    expect(cookie).not.toContain('__Host-learnbox_admin_otp_challenge=');
  });
});
