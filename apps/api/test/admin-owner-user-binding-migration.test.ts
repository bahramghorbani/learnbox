import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const migrationsDirectory = new URL('../../../database/migrations/', import.meta.url);

async function readBindingMigration() {
  return readFile(new URL('0016_admin_owner_user_binding.sql', migrationsDirectory), 'utf8');
}

describe('admin owner canonical user binding migration', () => {
  it('adds a nullable one-to-one foreign-key binding on admin_owner', async () => {
    const sql = await readBindingMigration();

    expect(sql).toMatch(/ALTER TABLE admin_owner/i);
    expect(sql).toMatch(/ADD COLUMN user_id UUID/i);
    expect(sql).toMatch(/REFERENCES users\s*\(id\)/i);
    expect(sql).toMatch(/UNIQUE\s*\(user_id\)/i);
    expect(sql).not.toMatch(/NOT NULL.*user_id|user_id.*NOT NULL/i);
  });

  it('does not bootstrap, synthesize, or infer an owner user', async () => {
    const sql = await readBindingMigration();

    expect(sql).not.toMatch(/INSERT\s+INTO\s+users/i);
    expect(sql).not.toMatch(/gen_random_uuid\s*\(\)/i);
    expect(sql).not.toMatch(/phone_e164\s*=|phone_e164\s*,/i);
    expect(sql).toMatch(/unmapped|bootstrap|fail.closed/i);
  });
});
