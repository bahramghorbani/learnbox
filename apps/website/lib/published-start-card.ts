import { Pool } from 'pg';
import { requireVerifiedDatabaseTls } from '../../api/dist/database/migration-runner.js';

import { canLearnerAccessContentId, isLearnerUserId } from './pack-access';

/**
 * Media may be read only when THIS LEARNER may access the card's pack.
 *
 * Publication alone is not the boundary: protected media must sit behind exactly the same canonical
 * rule as the card itself (`lib/pack-access`), or an authenticated but unentitled learner could skip
 * the card API and fetch the image or audio directly. The decision is delegated so there is one
 * rule, not a second copy that can drift.
 */
export async function canLearnerAccessStartContentId(
  contentId: string,
  userId: string,
): Promise<boolean> {
  if (process.env.WEB_LEARNER_STATE_ENABLED !== 'true' || !process.env.DATABASE_URL) return false;
  if (!isLearnerUserId(userId)) return false;
  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(process.env.DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    return await canLearnerAccessContentId(pool, contentId, userId);
  } finally {
    await pool.end();
  }
}
