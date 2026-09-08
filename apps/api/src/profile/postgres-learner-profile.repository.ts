import type { Pool } from 'pg';

import type { LearnerProfileRepository } from './learner-profile.service.js';

export class PostgresLearnerProfileRepository implements LearnerProfileRepository {
  constructor(private readonly pool: Pool) {}

  async findPhoneByUserId(userId: string): Promise<string | null> {
    const result = await this.pool.query<{ phone_e164: string }>(
      'SELECT phone_e164 FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0]?.phone_e164 ?? null;
  }
}
