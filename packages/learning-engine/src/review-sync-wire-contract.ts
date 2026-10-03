/**
 * Canonical review-sync wire contract (LB-B35 CP15, Workstream A).
 *
 * This module is the SINGLE authoritative definition of the deterministic scheduler-refusal
 * response. Before CP15 the same literal was written independently in three places — two
 * TypeScript HTTP boundaries and the Dart native transport — with nothing linking them. A
 * server-side rename therefore passed every suite on both sides while silently converting a
 * deterministic refusal into a retryable failure on native clients, which retry forever.
 *
 * Rules for changing anything in this file:
 *
 * 1. Both TypeScript boundaries MUST derive their response from these constants. They must never
 *    re-type the literal.
 * 2. The Dart native transport cannot import TypeScript, so it is bound mechanically instead:
 *    `scripts/sync-review-sync-wire-contract.mjs` generates
 *    `apps/mobile/test/fixtures/review_sync_wire_contract.json` from these constants, and
 *    `pnpm verify:review-sync-wire-contract` (inside `pnpm check`, i.e. the required `quality`
 *    job) fails if the committed fixture drifts from this file.
 * 3. `apps/mobile/test/review_sync_wire_contract_test.dart` consumes that generated fixture and
 *    drives the real `HttpReviewSyncTransport`. The required `mobile` job fails if native stops
 *    honouring the contract.
 *
 * Together those three rules give the CP15 acceptance criterion: a server-side rename or shape
 * change cannot reach `main` without CI failing first. Renaming the discriminator here makes the
 * committed fixture stale and `quality` fails; regenerating the fixture to match makes the Dart
 * conformance test see a code its transport does not treat as terminal and `mobile` fails.
 *
 * It is pure data: no I/O and no dependency on any other module, so every workspace and the
 * generator script can import it.
 */

/**
 * HTTP status for a deterministic scheduler refusal.
 *
 * 422 is deliberate and load-bearing: it separates "well-formed request the scheduler will refuse
 * identically every time" from the retryable 503 `serverUnavailable`. It must never be 503, and it
 * must never collide with the 400 `validation` / 401 `invalidToken` statuses.
 */
export const SCHEDULER_REJECTED_STATUS = 422 as const;

/** The single body key carrying a boundary error code. */
export const REVIEW_SYNC_ERROR_KEY = 'error' as const;

/**
 * The deterministic scheduler-refusal discriminator.
 *
 * Native matches this value exactly, so renaming it is a breaking wire change for every
 * already-installed client, not a cosmetic refactor.
 */
export const SCHEDULER_REJECTED_CODE = 'schedulerRejected' as const;

/**
 * The exact refusal body. Native requires a document with EXACTLY this one key, so the boundaries
 * must not add fields to this response.
 */
export function schedulerRejectedBody(): { readonly error: typeof SCHEDULER_REJECTED_CODE } {
  return { [REVIEW_SYNC_ERROR_KEY]: SCHEDULER_REJECTED_CODE } as const;
}

/**
 * Boundary error codes that are NOT the deterministic refusal, with the statuses they keep.
 *
 * Pinned here so the conformance fixture can prove native still treats each of them as retryable
 * (or as a terminal auth failure) exactly as it did before CP15.
 */
export const REVIEW_SYNC_NON_REJECTION_RESPONSES = [
  { code: 'validation', status: 400 },
  { code: 'invalidToken', status: 401 },
  { code: 'serverUnavailable', status: 503 },
] as const;

/** Shape of the generated cross-language fixture. */
export interface ReviewSyncWireContractFixture {
  readonly schedulerRejected: {
    readonly status: number;
    readonly body: Record<string, string>;
    readonly terminal: true;
    readonly retryable: false;
  };
  readonly nonRejections: readonly {
    readonly code: string;
    readonly status: number;
    readonly retryable: boolean;
  }[];
  /**
   * Shapes that are NOT the contract and MUST stay retryable, so an unrecognised response can
   * never strand a queued learner answer.
   */
  readonly nearMisses: readonly {
    readonly label: string;
    readonly status: number;
    readonly rawBody: string;
  }[];
}

/**
 * Build the cross-language fixture. The generator script writes exactly this, so the Dart test and
 * the TypeScript boundaries are provably reading one source of truth.
 */
export function buildReviewSyncWireContractFixture(): ReviewSyncWireContractFixture {
  return {
    schedulerRejected: {
      status: SCHEDULER_REJECTED_STATUS,
      body: schedulerRejectedBody(),
      terminal: true,
      retryable: false,
    },
    nonRejections: REVIEW_SYNC_NON_REJECTION_RESPONSES.map((entry) => ({
      code: entry.code,
      status: entry.status,
      // Every code in this list is by construction NOT the deterministic refusal, so all of them
      // keep the retryable classification they had before CP15. 401 is terminal for the pass but
      // is reported as an auth outcome, not as a scheduler rejection; native keeps its own
      // handling for it, which the Dart conformance test pins separately.
      retryable: true,
    })),
    nearMisses: [
      {
        label: 'correct code on the wrong status',
        status: 503,
        rawBody: JSON.stringify(schedulerRejectedBody()),
      },
      {
        label: 'rejection status with an unknown code',
        status: SCHEDULER_REJECTED_STATUS,
        rawBody: JSON.stringify({ [REVIEW_SYNC_ERROR_KEY]: 'someOtherCode' }),
      },
      {
        label: 'rejection status with an extra key',
        status: SCHEDULER_REJECTED_STATUS,
        rawBody: JSON.stringify({
          [REVIEW_SYNC_ERROR_KEY]: SCHEDULER_REJECTED_CODE,
          detail: 'extra',
        }),
      },
      {
        label: 'rejection status with wrong letter case',
        status: SCHEDULER_REJECTED_STATUS,
        rawBody: JSON.stringify({ [REVIEW_SYNC_ERROR_KEY]: 'schedulerrejected' }),
      },
      {
        label: 'rejection status with a non-JSON body',
        status: SCHEDULER_REJECTED_STATUS,
        rawBody: 'not json',
      },
      {
        label: 'rejection status with an empty body',
        status: SCHEDULER_REJECTED_STATUS,
        rawBody: '',
      },
    ],
  };
}
