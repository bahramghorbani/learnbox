import { defineConfig } from 'vitest/config';

/**
 * Explicit test configuration.
 *
 * Without this file Vitest used its defaults: a 5s per-test timeout and one
 * worker per CPU core. Under the full workspace run (`pnpm check`) several
 * suites build the API package and render the learner tree concurrently, so
 * heavier React/jsdom suites were starved of CPU and timed out at 5s even
 * though the code under test was correct — producing flaky, non-reproducible
 * failures that disappeared under `--no-file-parallelism`.
 *
 * Bounding the pool and raising the timeout makes the suite deterministic
 * whether it runs alone or as part of the workspace check.
 */
export default defineConfig({
  test: {
    // Environment stays per-file: 17 suites opt into jsdom with an
    // `@vitest-environment jsdom` pragma and the rest rely on node.
    testTimeout: 20000,
    hookTimeout: 20000,
    pool: 'forks',
    poolOptions: {
      forks: {
        // jsdom suites here are memory- and CPU-heavy; unbounded workers
        // thrash the machine instead of finishing faster.
        maxForks: 4,
        minForks: 1,
      },
    },
  },
});
