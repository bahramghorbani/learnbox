import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';

const run = promisify(execFile);
const maxBuffer = 64 * 1024 * 1024;
const commandLineTools = '/Library/Developer/CommandLineTools';

function fail(message) {
  throw new Error(`TRACKED_GIT_BLOB_DIGESTS_INVALID: ${message}`);
}

/** Git subprocesses must not depend on a full Xcode installation or provider access. */
export function gitEnvironment(environment = process.env) {
  return { ...environment, DEVELOPER_DIR: commandLineTools };
}

/**
 * SHA-256 digests of tracked Git blobs whose byte size matches one of the supplied sizes.
 * Byte identity implies equal size, so the size filter cannot hide a match, and no provider or
 * network call is performed.
 */
export async function readTrackedBlobDigests({ sizes, root = process.cwd(), environment } = {}) {
  const wanted = new Set(sizes ?? []);
  if (wanted.size === 0) fail('candidate byte sizes are required');
  for (const size of wanted) {
    if (!Number.isInteger(size) || size <= 0)
      fail('candidate byte sizes must be positive integers');
  }
  const options = { cwd: root, env: gitEnvironment(environment), maxBuffer, encoding: 'utf8' };
  const { stdout } = await run('git', ['ls-tree', '-r', '-l', '-z', 'HEAD'], options);
  const candidates = stdout
    .split('\0')
    .map((entry) => /^\d+ blob [a-f0-9]+ +(\d+)\t([\s\S]+)$/.exec(entry))
    .filter((match) => match && wanted.has(Number(match[1])))
    .map((match) => ({ bytes: Number(match[1]), path: match[2] }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

  const digests = new Map();
  for (const candidate of candidates) {
    const { stdout: blob } = await run('git', ['cat-file', 'blob', `HEAD:${candidate.path}`], {
      ...options,
      encoding: 'buffer',
    });
    if (blob.length !== candidate.bytes) fail(`${candidate.path} does not match its index size`);
    const digest = createHash('sha256').update(blob).digest('hex');
    digests.set(digest, [...(digests.get(digest) ?? []), candidate.path]);
  }
  return new Map(
    [...digests].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
}
