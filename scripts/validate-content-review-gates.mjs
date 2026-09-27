import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../database/migrations/0006_content_review_quality_gates.sql', import.meta.url),
  'utf8',
);
const required = [
  "ADD VALUE IF NOT EXISTS 'rejected'",
  "ADD VALUE IF NOT EXISTS 'reject'",
  'CREATE TABLE content_review_checks',
  'german_linguistic',
  'persian_translation',
  'provenance',
  'visual',
  'audio',
  'app_flow',
  "outcome = 'pending'",
  "outcome IN ('passed', 'failed')",
];
for (const value of required) {
  if (!migration.includes(value)) throw new Error(`Content review gate missing: ${value}`);
}
console.log('Content review quality gates are defined.');
