import { describe, expect, test } from 'vitest';

import { handleOwnerInviteIssue } from '../lib/owner-invite-http';

describe('owner invite HTTP boundary', () => {
  test('issues a no-store response only for a same-origin JSON request', async () => {
    const response = await handleOwnerInviteIssue(
      new Request('https://preview.example.com/api/owner/alpha-invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://preview.example.com',
        },
        body: '{}',
      }),
      {
        issue: async () => ({
          code: 'ALPHA-abcdefghijklmnopqrstuvwx',
          expiresAt: new Date('2026-08-11T12:30:00.000Z'),
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      code: 'ALPHA-abcdefghijklmnopqrstuvwx',
      expiresAt: '2026-08-11T12:30:00.000Z',
    });
  });

  test('does not issue a code for a cross-origin request', async () => {
    let called = false;
    const response = await handleOwnerInviteIssue(
      new Request('https://preview.example.com/api/owner/alpha-invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://other.example.com',
        },
        body: '{}',
      }),
      {
        issue: async () => {
          called = true;
          return { code: 'ALPHA-abcdefghijklmnopqrstuvwx', expiresAt: new Date() };
        },
      },
    );

    expect(response.status).toBe(403);
    expect(called).toBe(false);
  });

  test('reports only sanitized failure metadata when issuance fails', async () => {
    const diagnostics: unknown[] = [];
    const failure = Object.assign(new Error('relation details must stay private'), {
      code: '42P01',
    });
    const response = await handleOwnerInviteIssue(
      new Request('https://preview.example.com/api/owner/alpha-invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://preview.example.com',
        },
        body: '{}',
      }),
      {
        issue: async () => {
          throw failure;
        },
        reportIssue: (diagnostic: unknown) => diagnostics.push(diagnostic),
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'issue_unavailable' });
    expect(diagnostics).toEqual([{ code: '42P01', name: 'Error' }]);
  });
});
