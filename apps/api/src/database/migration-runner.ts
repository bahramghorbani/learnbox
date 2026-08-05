import { createHash } from 'node:crypto';

export type DatabaseMigration = {
  version: string;
  sql: string;
};

type MigrationRow = {
  version: string;
  checksum: string;
};

export interface MigrationClient {
  query(sql: string, parameters?: readonly unknown[]): Promise<{ rows: MigrationRow[] }>;
}

const migrationLockId = 1_825_273_952;

export function requireVerifiedDatabaseTls(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  parsed.searchParams.set('sslmode', 'verify-full');
  return parsed.toString();
}

export async function runDatabaseMigrations(
  client: MigrationClient,
  migrations: readonly DatabaseMigration[],
): Promise<{ applied: number }> {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await client.query('SELECT pg_advisory_lock($1)', [migrationLockId]);

  let applied = 0;
  try {
    const existing = await client.query(
      'SELECT version, checksum FROM schema_migrations ORDER BY version',
    );
    const checksums = new Map(existing.rows.map((row) => [row.version, row.checksum]));

    for (const migration of migrations) {
      const checksum = createHash('sha256').update(migration.sql).digest('hex');
      const recordedChecksum = checksums.get(migration.version);
      if (recordedChecksum && recordedChecksum !== checksum) {
        throw new Error(`Applied migration checksum mismatch: ${migration.version}`);
      }
      if (recordedChecksum) continue;

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
          migration.version,
          checksum,
        ]);
        await client.query('COMMIT');
        applied += 1;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return { applied };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [migrationLockId]);
  }
}
