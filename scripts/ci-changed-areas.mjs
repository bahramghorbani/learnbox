#!/usr/bin/env node
// Classifies a set of changed repository paths into the CI areas that can
// possibly be affected by them.
//
// Safety posture: this is an ALLOW-LIST of provably inert paths. A path that
// matches nothing known is treated as affecting everything. Adding a new
// source directory can therefore never silently lose coverage — it can only
// run more CI than strictly necessary.

/**
 * Paths that cannot affect any build, test, migration or image.
 * Documentation, planning material and the frozen Admin UI prototype
 * (static HTML/CSS/JS that nothing imports and no job builds).
 */
const INERT = [
  /^docs\//,
  /^prototypes\//,
  /^plans\//,
  /^animation-plans\//,
  /^\.github\/ISSUE_TEMPLATE\//,
  /^\.github\/PULL_REQUEST_TEMPLATE/,
  /^(README|CONTRIBUTING|SECURITY|CHANGELOG|BACKLOG|CURRENT_WORK)\.md$/,
  /^LICENSE$/,
];

/** Paths the Flutter job reads. Nothing else reaches apps/mobile. */
const MOBILE = [/^apps\/mobile\//, /^\.github\/workflows\//];

/**
 * Paths the production-stack job reads.
 *
 * The learner image is built with the repository ROOT as its Docker context,
 * so this list must cover every path the Dockerfile copies. Keep it in sync
 * with the COPY lines in infrastructure/production/app/Dockerfile:
 *   package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json
 *   apps/website apps/api packages/billing-core packages/learning-engine
 *   config content database/migrations
 *
 * apps/admin is deliberately NOT part of the learner image, so Admin-only
 * changes do not need the production image rebuilt.
 */
const INFRA = [
  /^infrastructure\//,
  /^apps\/website\//,
  /^apps\/api\//,
  /^packages\//,
  /^services\//,
  /^config\//,
  /^content\//,
  /^database\//,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^tsconfig\.base\.json$/,
  /^\.github\/workflows\//,
];

const matches = (patterns, file) => patterns.some((re) => re.test(file));

/**
 * @param {string[]} files changed paths, repository-relative, POSIX separators
 * @returns {{docsOnly: boolean, mobile: boolean, infra: boolean, code: boolean}}
 */
export function classify(files) {
  const changed = files.map((f) => f.trim()).filter(Boolean);

  // No detectable change (empty diff): run everything rather than guess.
  if (changed.length === 0) {
    return { docsOnly: false, mobile: true, infra: true, code: true };
  }

  const docsOnly = changed.every((f) => matches(INERT, f));

  return {
    docsOnly,
    mobile: !docsOnly && changed.some((f) => matches(MOBILE, f)),
    infra: !docsOnly && changed.some((f) => matches(INFRA, f)),
    code: !docsOnly,
  };
}

// CLI: paths on stdin (one per line), GitHub Actions outputs on stdout.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const input = await new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (buf += d));
    process.stdin.on('end', () => resolve(buf));
  });

  const files = input.split('\n');
  const result = classify(files);
  for (const [key, value] of Object.entries(result)) {
    process.stdout.write(`${key}=${value}\n`);
  }
}
