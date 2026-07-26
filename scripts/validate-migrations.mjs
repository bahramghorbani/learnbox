import { readdir } from 'node:fs/promises';

const migrations = await readdir(new URL('../database/migrations/', import.meta.url));
const numberedMigrations = migrations
  .map((file) => ({ file, match: /^(\d{4})_.+\.sql$/.exec(file) }))
  .filter((entry) => entry.match !== null)
  .map((entry) => ({ file: entry.file, number: Number(entry.match[1]) }))
  .sort((a, b) => a.number - b.number || a.file.localeCompare(b.file));

if (numberedMigrations.length === 0) {
  throw new Error('At least one numbered SQL migration is required.');
}

for (let index = 0; index < numberedMigrations.length; index += 1) {
  const expected = index + 1;
  if (numberedMigrations[index].number !== expected) {
    throw new Error(
      `Migration numbering must be contiguous; expected ${String(expected).padStart(4, '0')}.`,
    );
  }
}

console.log(`Validated ${numberedMigrations.length} migration(s).`);
