import { readdir, readFile } from 'node:fs/promises';

import pg from 'pg';

import {
  requireVerifiedDatabaseTls,
  runDatabaseMigrations,
  type DatabaseMigration,
  type MigrationClient,
} from './migration-runner.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to run migrations.');

const migrationsDirectory = new URL('../../../../database/migrations/', import.meta.url);
const fileNames = (await readdir(migrationsDirectory))
  .filter((fileName) => /^\d{4}_.+\.sql$/.test(fileName))
  .sort();
const migrations: DatabaseMigration[] = await Promise.all(
  fileNames.map(async (fileName) => ({
    version: fileName.slice(0, -4),
    sql: await readFile(new URL(fileName, migrationsDirectory), 'utf8'),
  })),
);

const pool = new pg.Pool({ connectionString: requireVerifiedDatabaseTls(databaseUrl) });
const client = await pool.connect();
try {
  const adapter: MigrationClient = {
    query: async (sql, parameters) => {
      const result = await client.query(sql, parameters ? [...parameters] : undefined);
      return { rows: result.rows as Array<{ version: string; checksum: string }> };
    },
  };
  const result = await runDatabaseMigrations(adapter, migrations);
  console.info(`Database migrations complete; applied ${result.applied}.`);
} finally {
  client.release();
  await pool.end();
}
