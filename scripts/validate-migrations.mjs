import { readdir } from 'node:fs/promises';

const migrations = await readdir(new URL('../database/migrations/', import.meta.url));
if (!migrations.some((file) => /^\d{4}_.+\.sql$/.test(file))) {
  throw new Error('At least one numbered SQL migration is required.');
}
console.log(`Validated ${migrations.length} migration(s).`);
