/**
 * LB-B35 CP15 (Workstream A): generate the cross-language review-sync wire contract fixture.
 *
 * The Dart native transport cannot import TypeScript, so the canonical contract in
 * `packages/learning-engine/src/review-sync-wire-contract.ts` is projected into a JSON fixture
 * that `apps/mobile/test/review_sync_wire_contract_test.dart` consumes.
 *
 * Usage:
 *   node scripts/sync-review-sync-wire-contract.mjs            # write the fixture
 *   node scripts/sync-review-sync-wire-contract.mjs --check     # fail if the fixture drifted
 *
 * `--check` runs inside `pnpm check` (the required `quality` job), so a server-side rename or
 * shape change cannot reach main while the committed fixture still describes the old contract.
 * This is the mechanical link that makes the three independent literals one contract.
 */
import { readFile, writeFile } from 'node:fs/promises';

const contractModule = new URL(
  '../packages/learning-engine/dist/review-sync-wire-contract.js',
  import.meta.url,
);
const outputFile = new URL(
  '../apps/mobile/test/fixtures/review_sync_wire_contract.json',
  import.meta.url,
);

async function loadContract() {
  try {
    return await import(contractModule.href);
  } catch (cause) {
    throw new Error(
      'Could not load the compiled learning-engine contract. Run ' +
        '`pnpm --filter @learnbox/learning-engine build` first.',
      { cause },
    );
  }
}

async function run() {
  const { buildReviewSyncWireContractFixture } = await loadContract();
  const fixture = buildReviewSyncWireContractFixture();
  const generated = `${JSON.stringify(fixture, null, 2)}\n`;

  if (process.argv.includes('--check')) {
    let committed;
    try {
      committed = await readFile(outputFile, 'utf8');
    } catch {
      throw new Error(
        'The review-sync wire contract fixture is missing. Run ' +
          '`node scripts/sync-review-sync-wire-contract.mjs`.',
      );
    }
    if (committed !== generated) {
      throw new Error(
        'The review-sync wire contract fixture is out of sync with ' +
          'packages/learning-engine/src/review-sync-wire-contract.ts.\n' +
          'A boundary contract change must be reviewed together with the native transport: run ' +
          '`node scripts/sync-review-sync-wire-contract.mjs` and make sure ' +
          'apps/mobile still maps the deterministic refusal to a terminal SchedulerRejected.',
      );
    }
    console.log(
      'Review-sync wire contract fixture matches the canonical contract ' +
        `(status ${fixture.schedulerRejected.status}, ` +
        `code "${fixture.schedulerRejected.body.error}").`,
    );
    return;
  }

  await writeFile(outputFile, generated);
  console.log('Review-sync wire contract fixture synchronized.');
}

await run();
