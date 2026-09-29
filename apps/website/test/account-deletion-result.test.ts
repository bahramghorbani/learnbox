import { describe, expect, it } from 'vitest';

import { accountDeletionResultFromResponse } from '../lib/account-deletion-result';

const json = (body: unknown, status: number) => Response.json(body, { status });

describe('account deletion result mapping (LB-B29)', () => {
  it('a 200 is deleted, carrying the deletion id', async () => {
    expect(await accountDeletionResultFromResponse(json({ deletionId: 'del_1' }, 200))).toEqual({
      status: 'deleted',
      deletionId: 'del_1',
    });
  });

  it('a wrong phone number is a mismatch, and only that', async () => {
    expect(
      await accountDeletionResultFromResponse(json({ error: 'confirmationMismatch' }, 403)),
    ).toEqual({ status: 'mismatch' });
  });

  it('a guard rejection is NOT reported as a wrong phone number', async () => {
    expect(
      await accountDeletionResultFromResponse(json({ error: 'request_rejected' }, 403)),
    ).toEqual({
      status: 'unavailable',
    });
    expect(await accountDeletionResultFromResponse(new Response('nope', { status: 403 }))).toEqual({
      status: 'unavailable',
    });
  });

  it('keeps the other outcomes: 409 refused, everything else unavailable', async () => {
    expect(
      await accountDeletionResultFromResponse(json({ error: 'deletionUnavailable' }, 409)),
    ).toEqual({
      status: 'refused',
    });
    for (const status of [400, 401, 500, 503]) {
      expect(await accountDeletionResultFromResponse(json({ error: 'x' }, status))).toEqual({
        status: 'unavailable',
      });
    }
  });
});
