/**
 * Historical replay compatibility (LB-B35 CP2).
 *
 * CP1 found that re-running a learner's `review_events` through the v1 scheduler reproduces the stored
 * `card_schedules` row exactly for 22 of 31 cards in the Production backup, while 9 early-history cards
 * differ (8 of them by exactly 10/9 in stability). The cause could not be proven from the repository
 * (most likely an earlier engine build that wrote those rows).
 *
 * Policy, fixed here so no later checkpoint has to re-decide it:
 *  1. The STORED schedule row is authoritative for Box, Learned and Mastered. A replay never overwrites
 *     it, and a mismatch is never "repaired" by rewriting `review_events` or `card_schedules`.
 *  2. Replay is a verification instrument only. It classifies the stored row against the replayed one.
 *  3. A difference that does not change the canonical Box is tolerated (`same-box`). A difference that
 *     changes the Box is a `conflict`: it is reported, never silently accepted or auto-corrected.
 *
 * Pure: no I/O.
 */
import { boxFromStabilityDays, type Box } from './definitions.js';

export type ReplayAgreement = 'exact' | 'same-box' | 'conflict';

export interface ReplayComparison {
  agreement: ReplayAgreement;
  storedBox: Box;
  replayedBox: Box;
  /** stored / replayed stability; null when the replayed stability is not positive. */
  stabilityRatio: number | null;
}

/** Relative tolerance below which two stability values count as the same number (float noise only). */
export const EXACT_STABILITY_TOLERANCE = 1e-7;

export function compareStoredToReplayed(
  storedStabilityDays: number,
  replayedStabilityDays: number,
): ReplayComparison {
  const storedBox = boxFromStabilityDays(storedStabilityDays);
  const replayedBox = boxFromStabilityDays(replayedStabilityDays);
  const stabilityRatio =
    replayedStabilityDays > 0 ? storedStabilityDays / replayedStabilityDays : null;
  const exact = Math.abs(storedStabilityDays - replayedStabilityDays) < EXACT_STABILITY_TOLERANCE;
  const agreement: ReplayAgreement = exact
    ? 'exact'
    : storedBox === replayedBox
      ? 'same-box'
      : 'conflict';
  return { agreement, storedBox, replayedBox, stabilityRatio };
}

export interface ReplayCompatibilityReport {
  compared: number;
  exact: number;
  sameBox: number;
  conflicts: number;
}

export function summarizeReplayComparisons(
  comparisons: Iterable<ReplayComparison>,
): ReplayCompatibilityReport {
  const report = { compared: 0, exact: 0, sameBox: 0, conflicts: 0 };
  for (const { agreement } of comparisons) {
    report.compared += 1;
    if (agreement === 'exact') report.exact += 1;
    else if (agreement === 'same-box') report.sameBox += 1;
    else report.conflicts += 1;
  }
  return report;
}
