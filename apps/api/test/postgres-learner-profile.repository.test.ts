import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { PostgresLearnerProfileRepository } from '../src/profile/postgres-learner-profile.repository.js';

const userId = '2efaf676-84e4-45b1-8a13-50735a8df2c8';

describe('PostgresLearnerProfileRepository', () => {
  it('reads only phone_e164 for canonical user id through a parameterized query', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [{ phone_e164: '+989121234567' }] };
      },
    } as unknown as Pool;

    await expect(
      new PostgresLearnerProfileRepository(pool).findPhoneByUserId(userId),
    ).resolves.toBe('+989121234567');
    expect(calls[0]?.sql).toMatch(/SELECT\s+phone_e164\s+FROM\s+users/i);
    expect(calls[0]?.sql).not.toMatch(/first_name|SELECT\s+\*/i);
    expect(calls[0]?.params).toEqual([userId]);
  });
});
