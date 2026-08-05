import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  requireVerifiedDatabaseTls,
  runDatabaseMigrations,
  type DatabaseMigration,
  type MigrationClient,
} from '../src/database/migration-runner.js';

const migrations: DatabaseMigration[] = [
  { version: '0001_initial', sql: 'CREATE TABLE users (id UUID PRIMARY KEY);' },
  { version: '0002_cards', sql: 'CREATE TABLE cards (id UUID PRIMARY KEY);' },
];

class RecordingMigrationClient implements MigrationClient {
  calls: Array<{ sql: string; parameters?: readonly unknown[] }> = [];
  applied = new Map<string, string>();

  async query(sql: string, parameters?: readonly unknown[]) {
    this.calls.push({ sql, parameters });
    if (sql.includes('SELECT version, checksum FROM schema_migrations')) {
      return {
        rows: [...this.applied].map(([version, checksum]) => ({ version, checksum })),
      };
    }
    if (sql.includes('INSERT INTO schema_migrations')) {
      this.applied.set(String(parameters?.[0]), String(parameters?.[1]));
    }
    return { rows: [] };
  }
}

describe('runDatabaseMigrations', () => {
  it('applies each pending migration transactionally and records its checksum', async () => {
    const client = new RecordingMigrationClient();

    await expect(runDatabaseMigrations(client, migrations)).resolves.toEqual({ applied: 2 });

    expect(client.calls.map(({ sql }) => sql)).toEqual([
      expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations'),
      expect.stringContaining('pg_advisory_lock'),
      expect.stringContaining('SELECT version, checksum FROM schema_migrations'),
      'BEGIN',
      migrations[0].sql,
      expect.stringContaining('INSERT INTO schema_migrations'),
      'COMMIT',
      'BEGIN',
      migrations[1].sql,
      expect.stringContaining('INSERT INTO schema_migrations'),
      'COMMIT',
      expect.stringContaining('pg_advisory_unlock'),
    ]);
    expect(client.applied.get('0001_initial')).toBe(
      createHash('sha256').update(migrations[0].sql).digest('hex'),
    );
  });

  it('skips migrations whose recorded checksum still matches', async () => {
    const client = new RecordingMigrationClient();
    client.applied.set(
      '0001_initial',
      createHash('sha256').update(migrations[0].sql).digest('hex'),
    );

    await expect(runDatabaseMigrations(client, migrations.slice(0, 1))).resolves.toEqual({
      applied: 0,
    });
    expect(client.calls.some(({ sql }) => sql === migrations[0].sql)).toBe(false);
  });

  it('refuses to continue when an applied migration file was changed', async () => {
    const client = new RecordingMigrationClient();
    client.applied.set('0001_initial', 'different-checksum');

    await expect(runDatabaseMigrations(client, migrations.slice(0, 1))).rejects.toThrow(
      'Applied migration checksum mismatch: 0001_initial',
    );
    expect(client.calls.some(({ sql }) => sql === migrations[0].sql)).toBe(false);
    expect(client.calls.at(-1)?.sql).toContain('pg_advisory_unlock');
  });
});

describe('requireVerifiedDatabaseTls', () => {
  it('pins certificate and hostname verification for hosted Postgres connections', () => {
    expect(
      requireVerifiedDatabaseTls(
        'postgresql://learnbox:secret@example.neon.tech/learnbox?sslmode=require&channel_binding=require',
      ),
    ).toBe(
      'postgresql://learnbox:secret@example.neon.tech/learnbox?sslmode=verify-full&channel_binding=require',
    );
  });
});
