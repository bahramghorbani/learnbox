import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const adminInfrastructure = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(adminInfrastructure, '../../..');
const script = resolve(adminInfrastructure, 'build-admin-image.sh');

const baseline = 'sha256:87490d60978e83cff664df31e5820ff47fb085d41754c8f666b0a6d7e82355d5';
const candidate = 'sha256:d327590ca12e919dfff5f2d45394cb909b890a51422092c222ed569900517971';
const source = 'a7f582647e0297c04dcf2e967989e39ffd38df9c';

const bundle = [
  'profileIdentityFlag:C="true"',
  'eT({binaryWire:!0,storage:eK(),key:t0,ownerId:Y,...{quarantineKey:eR(t0)}})',
  'JSON.stringify(n?{nextCardIndex:e,nextCardId:n}:{nextCardIndex:e})',
  'sessionEnded&&1',
  'goal:void 0',
].join(';');

function fakeDocker(directory) {
  const path = join(directory, 'docker');
  writeFileSync(
    path,
    `#!/bin/sh
set -eu
[ -z "\${FAKE_DOCKER_LOG:-}" ] || printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
command="$1"; shift
if [ "$command" = container ]; then
  shift
  case "$*" in *'.State.Running'*) printf '%s\\n' "\${FAKE_RUNNING:-true}" ;; *'.Image'*) printf '%s\\n' "\${FAKE_BASELINE:-${baseline}}" ;; esac
  exit 0
fi
if [ "$command" = info ]; then echo linux/amd64; exit 0; fi
if [ "$command" = build ]; then exit 0; fi
if [ "$command" = image ] && [ "\${1:-}" = rm ]; then exit 0; fi
if [ "$command" = run ]; then
  case "$*" in
    *'sha256sum /app/apps/website/package.json'*) printf '%s\\n' "$FAKE_PACKAGE_SHA" ;;
    *'cat /app/apps/website/.next/static/chunks/app/page-'*) printf '%s\\n' '${bundle}' ;;
  esac
  exit 0
fi
if [ "$command" = image ] && [ "$1" = inspect ]; then
  image="$2"; shift 2
  format=""
  if [ "\${1:-}" = --format ]; then format="$2"; fi
  source_sha="${source}"
  if [ "$image" = "\${FAKE_BASELINE:-${baseline}}" ]; then source_sha=15e6783b8f3efed2dbf1de382161099fd8b0b7fe; fi
  if [ "$image" = "\${FAKE_BASELINE:-${baseline}}" ] && [ "\${FAKE_UNLABELED:-false}" = true ] && printf '%s' "$format" | grep -q 'io.learnbox.release.'; then exit 0; fi
  case "$format" in
    *'.Id'*) printf '%s\\n' "$image" ;;
    *'.Architecture'*) echo amd64 ;;
    *'.Os'*) echo linux ;;
    *'.Size'*) echo 42 ;;
    *'.Config.User'*) echo nextjs ;;
    *'.Config.Cmd'*) echo '[node apps/website/server.js]' ;;
    *'org.opencontainers.image.revision'*) printf '%s\\n' "$source_sha" ;;
    *'org.opencontainers.image.title'*) echo learnbox-app ;;
    *'io.learnbox.release.profile_identity'*) echo true ;;
    *'io.learnbox.release.queue_quarantine'*) echo true ;;
    *'io.learnbox.release.server_session_plan'*) echo true ;;
    *'io.learnbox.release.goal_ux_removed'*) echo true ;;
    *'io.learnbox.release.session_expiry_ux'*) echo true ;;
    *'io.learnbox.release.binary_review_ui'*) echo true ;;
    *'range .Config.Env'*) printf 'APP_SOURCE_SHA=%s\\nNODE_ENV=production\\n' "$source_sha" ;;
  esac
  exit 0
fi
exit 1
`,
  );
  chmodSync(path, 0o755);
}

function readCalls(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function runPreflight(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'lb-release-artifact-'));
  fakeDocker(directory);
  const packageHash = execFileSync('shasum', ['-a', '256', 'apps/website/package.json'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).split(' ')[0];
  const dockerLog = join(directory, 'docker.log');
  const environment = {
    ...process.env,
    PATH: `${directory}:${process.env.PATH}`,
    LEARNBOX_IMAGE_TARGET: 'app',
    LEARNBOX_RELEASE_PREFLIGHT: 'true',
    LEARNBOX_CANDIDATE_IMAGE: candidate,
    LEARNBOX_RUNNING_CONTAINER: 'production-app',
    FAKE_PACKAGE_SHA: packageHash,
    FAKE_DOCKER_LOG: dockerLog,
    ...overrides,
  };
  try {
    return {
      output: execFileSync('bash', [script, source, 'release'], {
        cwd: repositoryRoot,
        env: environment,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
      calls: readCalls(dockerLog),
      status: 0,
    };
  } catch (error) {
    return {
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
      calls: readCalls(dockerLog),
      status: error.status,
    };
  }
}

test('exact running Production bridge approves the existing candidate without building it', () => {
  const result = runPreflight();
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /release preflight only; existing image .* will not be rebuilt/);
  assert.match(result.output, /RELEASE ARTIFACT: APPROVED/);
  assert.doesNotMatch(result.calls, /^build/m);
});

test('release preflight rejects a missing, substituted or stopped running baseline', () => {
  const missing = runPreflight({ LEARNBOX_RUNNING_CONTAINER: '' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.output, /needs LEARNBOX_CANDIDATE_IMAGE and LEARNBOX_RUNNING_CONTAINER/);

  const substituted = runPreflight({ LEARNBOX_RUNNING_IMAGE: baseline });
  assert.notEqual(substituted.status, 0);
  assert.match(substituted.output, /LEARNBOX_RUNNING_IMAGE is not accepted/);

  const stopped = runPreflight({ FAKE_RUNNING: 'false' });
  assert.notEqual(stopped.status, 0);
  assert.match(stopped.output, /baseline container must exist and be running/);
  assert.doesNotMatch(stopped.output, /RELEASE ARTIFACT: APPROVED/);
});

test('release preflight rejects an unknown candidate or an unlabeled baseline outside the exact bridge', () => {
  const wrongCandidate = runPreflight({ LEARNBOX_CANDIDATE_IMAGE: 'sha256:other-candidate' });
  assert.notEqual(wrongCandidate.status, 0);
  assert.match(wrongCandidate.output, /bridge candidate digest is exact/);

  const unknownBaseline = runPreflight({
    FAKE_BASELINE: 'sha256:other-baseline',
    FAKE_UNLABELED: 'true',
  });
  assert.notEqual(unknownBaseline.status, 0);
  assert.match(unknownBaseline.output, /no bridge applies/);
});

test('a labeled future baseline is revalidated and bound to the new running image', () => {
  const futureBaseline = 'sha256:labeled-future-baseline';
  const result = runPreflight({ FAKE_BASELINE: futureBaseline });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /running baseline source label matches runtime value/);
  assert.match(result.output, /RELEASE ARTIFACT: APPROVED/);
});

test('ordinary builds are explicitly development-only', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lb-development-artifact-'));
  fakeDocker(directory);
  const packageHash = execFileSync('shasum', ['-a', '256', 'apps/website/package.json'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).split(' ')[0];
  const output = execFileSync('bash', [script, source, 'candidate'], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      LEARNBOX_IMAGE_TARGET: 'app',
      FAKE_PACKAGE_SHA: packageHash,
    },
    encoding: 'utf8',
  });
  assert.match(output, /DEVELOPMENT IMAGE CANDIDATE: VERIFIED/);
  assert.match(output, /not release-approved/);
  assert.doesNotMatch(output, /RELEASE ARTIFACT: APPROVED/);
});

// The release tool must remain fail-closed even if a future edit removes these executable cases.
test('release preflight source requires a running container, exact bridge and non-releasable development output', () => {
  const sourceText = readFileSync(script, 'utf8');
  assert.match(sourceText, /LEARNBOX_RUNNING_CONTAINER/);
  assert.match(sourceText, /RELEASE ARTIFACT: APPROVED/);
  assert.match(sourceText, /DEVELOPMENT IMAGE CANDIDATE: VERIFIED .*not release-approved/);
  assert.match(sourceText, /iran-app-87490d60\.env/);
});
