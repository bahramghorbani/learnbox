import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The postgres image declares a data VOLUME. `docker rm -f` on a `--rm` container skips the
// auto-remove path and leaves that anonymous volume (holding the restored data) behind.
// Cleanup must also only ever remove the container this run created, by its real ID.
const scripts = [
  '../checks/account-deletion-integration-check.sh',
  '../learnbox-recovery-drill.sh',
  '../learnbox-restore-drill.sh',
];

for (const path of scripts) {
  test(`${path} removes only the scratch container it created, with its volume`, () => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const cleanup = source.match(/cleanup\(\) *\{[^}]*\}/)?.[0] ?? '';
    assert.match(cleanup, /\[ -n "\$CID" \] && docker rm -fv "\$CID"/);
    assert.match(source, /CID=\$\(docker run -d --rm --name/);
    assert.doesNotMatch(source, /docker rm -f "/);
  });
}

// Run the real restore drill against a fake `docker` that logs every call.
function drill(runFails) {
  const dir = mkdtempSync(join(tmpdir(), 'lb-drill-'));
  const log = join(dir, 'docker.log');
  const run = runFails
    ? 'echo "Conflict. The container name is already in use" >&2; exit 125'
    : 'echo cid-created-by-this-run';
  writeFileSync(
    join(dir, 'docker'),
    `#!/bin/sh\necho "$*" >> "${log}"\ncase "$1" in\n  run) ${run} ;;\n  exec) exit 1 ;;\nesac\n`,
  );
  writeFileSync(join(dir, 'sleep'), '#!/bin/sh\n');
  chmodSync(join(dir, 'docker'), 0o755);
  chmodSync(join(dir, 'sleep'), 0o755);
  const archive = join(dir, 'learnbox-x.sql.gz');
  writeFileSync(archive, '');
  const script = fileURLToPath(new URL('../learnbox-restore-drill.sh', import.meta.url));
  try {
    execFileSync('bash', [script, archive], {
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        LEARNBOX_MONITOR_STATE_DIR: dir,
        LEARNBOX_ALERT_BIN: join(dir, 'no-alert'),
      },
      stdio: 'pipe',
    });
  } catch {
    // the drill fails here by design; only its cleanup calls matter
  }
  return readFileSync(log, 'utf8').split('\n').filter(Boolean);
}

test('restore drill removes the container it created by ID, with its volume', () => {
  const removals = drill(false).filter((call) => call.startsWith('rm'));
  assert.deepEqual(removals, ['rm -fv cid-created-by-this-run']);
});

test('restore drill removes nothing when its container was not created (name taken)', () => {
  const calls = drill(true);
  assert.ok(calls.some((call) => call.startsWith('run')));
  assert.deepEqual(
    calls.filter((call) => call.startsWith('rm')),
    [],
  );
});
