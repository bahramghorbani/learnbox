import { describe, expect, it } from 'vitest';

import {
  handleAccountDeletionPost,
  phoneConfirmationMatches,
  type AccountDeletionDependencies,
  type DeletionOutcome,
} from '../lib/account-deletion-http';

const ORIGIN = 'https://app.learnboxapp.com';
const ENV = { LEARNBOX_PUBLIC_APP_ORIGIN: ORIGIN };
const PHONE = '+989121234567';

function request(
  body: unknown,
  overrides: { origin?: string | null; method?: string; contentType?: string } = {},
): Request {
  const headers = new Headers();
  if (overrides.origin !== null) headers.set('origin', overrides.origin ?? ORIGIN);
  headers.set('content-type', overrides.contentType ?? 'application/json');
  const method = overrides.method ?? 'POST';
  return new Request(`${ORIGIN}/api/learner/account`, {
    method,
    headers,
    // GET/HEAD may not carry a body at all, which is itself proof the endpoint is POST-only.
    body:
      method === 'GET' || method === 'HEAD'
        ? undefined
        : typeof body === 'string'
          ? body
          : JSON.stringify(body),
  });
}

function deps(overrides: Partial<AccountDeletionDependencies> = {}): AccountDeletionDependencies {
  return {
    readAccountPhone: async () => PHONE,
    deleteAccount: async (): Promise<DeletionOutcome> => ({
      status: 'deleted',
      deletionId: 'del_abc123',
    }),
    ...overrides,
  };
}

const subject = () => 'user-1';

describe('phone confirmation', () => {
  it('accepts the same number written in different legitimate formats', () => {
    for (const typed of ['09121234567', '+989121234567', '0098 912 123 4567', '۰۹۱۲۱۲۳۴۵۶۷']) {
      expect(phoneConfirmationMatches(typed, PHONE)).toBe(true);
    }
  });

  it('rejects a different number, including a near miss', () => {
    expect(phoneConfirmationMatches('09121234568', PHONE)).toBe(false);
    expect(phoneConfirmationMatches('0912123456', PHONE)).toBe(false);
    expect(phoneConfirmationMatches('', PHONE)).toBe(false);
  });
});

describe('account deletion boundary', () => {
  it('deletes the account behind the session and returns the deletion id', async () => {
    const response = await handleAccountDeletionPost(
      request({ confirmPhone: '09121234567', requestId: 'r1' }),
      deps(),
      subject,
      ENV,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'deleted', deletionId: 'del_abc123' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('deletes only the session subject, never a caller-supplied user id', async () => {
    let deletedUserId = '';
    const response = await handleAccountDeletionPost(
      // A malicious body naming someone else must be ignored entirely.
      request({ confirmPhone: '09121234567', requestId: 'r1', userId: 'victim-42' }),
      deps({
        deleteAccount: async ({ userId }) => {
          deletedUserId = userId;
          return { status: 'deleted', deletionId: 'del_ok' };
        },
      }),
      subject,
      ENV,
    );
    expect(response.status).toBe(200);
    expect(deletedUserId).toBe('user-1');
  });

  // LB-B29: a guard rejection is the shared `403 request_rejected`, and it never reaches the
  // session, the body or the database. (Before v1.2.1 these were `400 validation`.)
  const REJECTED = { error: 'request_rejected' };

  it('refuses a cross-site request even with a valid session', async () => {
    let called = false;
    const response = await handleAccountDeletionPost(
      request({ confirmPhone: '09121234567', requestId: 'r1' }, { origin: 'https://evil.example' }),
      deps({
        deleteAccount: async () => {
          called = true;
          return { status: 'deleted', deletionId: 'x' };
        },
      }),
      subject,
      ENV,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(REJECTED);
    expect(called).toBe(false);
  });

  it('refuses a request with no Origin header', async () => {
    const response = await handleAccountDeletionPost(
      request({ confirmPhone: '09121234567', requestId: 'r1' }, { origin: null }),
      deps(),
      subject,
      ENV,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(REJECTED);
  });

  it('refuses a form/text content type even from the right origin', async () => {
    for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', '']) {
      const response = await handleAccountDeletionPost(
        request({ confirmPhone: '09121234567', requestId: 'r1' }, { contentType }),
        deps(),
        subject,
        ENV,
      );
      expect(response.status).toBe(403);
    }
  });

  it('refuses GET', async () => {
    const response = await handleAccountDeletionPost(
      request({ confirmPhone: '09121234567', requestId: 'r1' }, { method: 'GET' }),
      deps(),
      subject,
      ENV,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(REJECTED);
  });

  it('rejects before authentication: a foreign origin learns nothing about the session', async () => {
    const withSession = await handleAccountDeletionPost(
      request({ confirmPhone: '09121234567', requestId: 'r1' }, { origin: 'https://evil.example' }),
      deps(),
      subject,
      ENV,
    );
    const withoutSession = await handleAccountDeletionPost(
      request({ confirmPhone: '09121234567', requestId: 'r1' }, { origin: 'https://evil.example' }),
      deps(),
      () => null,
      ENV,
    );
    expect(withSession.status).toBe(403);
    expect(withoutSession.status).toBe(403);
    expect(await withoutSession.json()).toEqual(REJECTED);
  });

  it('keeps the phone-mismatch 403 distinguishable from a guard rejection', async () => {
    const response = await handleAccountDeletionPost(
      request({ confirmPhone: '09129999999', requestId: 'r1' }),
      deps(),
      subject,
      ENV,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'confirmationMismatch' });
  });

  it('requires a session', async () => {
    const response = await handleAccountDeletionPost(
      request({ confirmPhone: '09121234567', requestId: 'r1' }),
      deps(),
      () => null,
      ENV,
    );
    expect(response.status).toBe(401);
  });

  it('refuses when the typed phone does not match, without deleting', async () => {
    let called = false;
    const response = await handleAccountDeletionPost(
      request({ confirmPhone: '09120000000', requestId: 'r1' }),
      deps({
        deleteAccount: async () => {
          called = true;
          return { status: 'deleted', deletionId: 'x' };
        },
      }),
      subject,
      ENV,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'confirmationMismatch' });
    expect(called).toBe(false);
  });

  it('requires a confirmation and a request id', async () => {
    expect(
      (await handleAccountDeletionPost(request({ requestId: 'r1' }), deps(), subject, ENV)).status,
    ).toBe(400);
    expect(
      (
        await handleAccountDeletionPost(
          request({ confirmPhone: '09121234567' }),
          deps(),
          subject,
          ENV,
        )
      ).status,
    ).toBe(400);
  });

  it('reports a privileged account as a conflict rather than pretending to delete', async () => {
    const response = await handleAccountDeletionPost(
      request({ confirmPhone: '09121234567', requestId: 'r1' }),
      deps({
        deleteAccount: async () => ({ status: 'refused', reason: 'privileged_account' }),
      }),
      subject,
      ENV,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'deletionUnavailable',
      reason: 'privileged_account',
    });
  });

  it('treats a retry of a completed deletion as the same success, with the original id', async () => {
    const response = await handleAccountDeletionPost(
      request({ confirmPhone: '09121234567', requestId: 'r1' }),
      deps({
        deleteAccount: async () => ({ status: 'already_deleted', deletionId: 'del_first' }),
      }),
      subject,
      ENV,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'deleted', deletionId: 'del_first' });
  });

  it('expires the session cookie so a stateless session cannot outlive the account', async () => {
    const response = await handleAccountDeletionPost(
      request({ confirmPhone: '09121234567', requestId: 'req-1' }),
      deps(),
      () => 'user-1',
      { ...ENV, NODE_ENV: 'production' },
    );

    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('learnbox_alpha_session=;');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
  });

  it('never leaks the registered phone number in any response', async () => {
    const responses = await Promise.all([
      handleAccountDeletionPost(
        request({ confirmPhone: '09120000000', requestId: 'r1' }),
        deps(),
        subject,
        ENV,
      ),
      handleAccountDeletionPost(
        request({ confirmPhone: '09121234567', requestId: 'r1' }),
        deps(),
        subject,
        ENV,
      ),
    ]);
    for (const response of responses) {
      const text = await response.text();
      expect(text).not.toContain('9121234567');
      expect(text).not.toContain(PHONE);
    }
  });

  it('survives a malformed JSON body', async () => {
    const response = await handleAccountDeletionPost(request('{not json'), deps(), subject, ENV);
    expect(response.status).toBe(400);
  });

  it('reports a storage failure as unavailable instead of claiming success', async () => {
    const response = await handleAccountDeletionPost(
      request({ confirmPhone: '09121234567', requestId: 'r1' }),
      deps({
        deleteAccount: async () => {
          throw new Error('db down');
        },
      }),
      subject,
      ENV,
    );
    expect(response.status).toBe(503);
  });
});
