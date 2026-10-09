import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * The nightly backup alert has to say WHY it failed, and must not leak a credential doing it.
 *
 * For seven consecutive nights (2026-10-03 .. 2026-10-09) production sent "pg_dump did not
 * complete" and nothing else, while the real cause — one missing SELECT privilege on
 * review_event_rejections_id_seq — sat in a stderr the script captured and then discarded. The
 * script now carries that text into the status file and the alert, through sanitize_error.
 *
 * sanitize_error is tested as the real bytes that ship: the function is extracted from the script
 * and evaluated, so the test cannot drift from the deployed implementation.
 */
const scriptPath = join(import.meta.dirname, '../learnbox-backup.sh');
const script = readFileSync(scriptPath, 'utf8');

function extractFunction(name) {
  const start = script.indexOf(`${name}() {`);
  assert.notEqual(start, -1, `${name} must exist in learnbox-backup.sh`);
  const end = script.indexOf('\n}', start);
  assert.notEqual(end, -1, `${name} must be a complete shell function`);
  return script.slice(start, end + 2);
}

const sanitize = extractFunction('sanitize_error');

function sanitizeError(input) {
  return execFileSync('bash', ['-c', `${sanitize}\nsanitize_error`], {
    input,
    encoding: 'utf8',
  });
}

test('keeps the diagnostic that identifies the fault', () => {
  const real =
    'pg_dump: error: query failed: ERROR:  permission denied for sequence review_event_rejections_id_seq\n' +
    'pg_dump: detail: Query was: SELECT last_value, is_called FROM public.review_event_rejections_id_seq\n';
  const out = sanitizeError(real);
  assert.match(out, /permission denied for sequence review_event_rejections_id_seq/);
  assert.match(out, /SELECT last_value, is_called/);
  assert.equal(out.includes('\n'), false, 'the alert reason must be a single line');
});

test('removes a connection string, with or without a password', () => {
  const leaky =
    'pg_dump: error: connection to server failed for "postgresql://learnbox_migrator:npg_SuperSecret123@ep-jolly-hill.eu-central-1.aws.neon.tech/neondb?sslmode=require"\n';
  const out = sanitizeError(leaky);
  assert.equal(out.includes('npg_SuperSecret123'), false);
  assert.equal(out.includes('learnbox_migrator:'), false);
  assert.equal(out.includes('ep-jolly-hill'), false);
  assert.match(out, /\[redacted\]/);
});

test('removes a password or token that arrives on its own', () => {
  const out = sanitizeError(
    'pg_dump: error: PGPASSWORD=hunter2 rejected; password=hunter2; token npg_abc123DEF\n',
  );
  assert.equal(out.includes('hunter2'), false);
  assert.equal(out.includes('npg_abc123DEF'), false);
});

test('bounds the reason so an alert cannot be flooded', () => {
  const out = sanitizeError(`${'x'.repeat(5000)}\n`);
  assert.ok(out.trim().length <= 400, `expected <= 400 characters, got ${out.trim().length}`);
});

test('reports a usable message when the failure produced no output', () => {
  assert.equal(sanitizeError('').trim(), '');
  assert.match(script, /no diagnostic output captured/);
});

test('the failure path passes the sanitised reason to the alert', () => {
  assert.match(script, /fail "pg_dump did not complete: \$\{err:-no diagnostic output captured\}"/);
  assert.match(script, /err="\$\(sanitize_error < \/tmp\/lb-backup-err\.\$\$/);
  // Diagnostic capture files can contain a DSN: they must never be world-readable.
  assert.match(script, /^umask 077$/m);
});

test('reads the least-privilege backup credential, falling back to the legacy DSN', () => {
  assert.match(script, /LEARNBOX_MIGRATOR_DATABASE_URL=/);
  assert.match(script, /db-roles\.env/);
  assert.match(script, /\^DATABASE_URL=/);
});

test('never passes the credential as a command argument', () => {
  assert.match(script, /docker run --rm -i -e PGURL="\$PGURL"/);
  assert.equal(/pg_dump[^\n]*\$PGURL"[^\n]*\$\{?PGURL/.test(script), false);
});
