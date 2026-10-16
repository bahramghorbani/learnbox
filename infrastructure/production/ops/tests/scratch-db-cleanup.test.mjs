import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The postgres image declares a data VOLUME. `docker rm -f` on a `--rm` container skips the
// auto-remove path and leaves that anonymous volume (holding the restored data) behind.
const scripts = [
  '../checks/account-deletion-integration-check.sh',
  '../learnbox-recovery-drill.sh',
  '../learnbox-restore-drill.sh',
];

for (const path of scripts) {
  test(`${path} removes its scratch database volume`, () => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const cleanup = source.match(/cleanup\(\) *\{[^}]*\}/)?.[0] ?? '';
    assert.match(cleanup, /docker rm -fv /);
    assert.doesNotMatch(source, /docker rm -f "/);
  });
}
