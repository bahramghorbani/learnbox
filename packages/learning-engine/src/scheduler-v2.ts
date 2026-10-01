import {
  BOX_LOWER_BOUND_DAYS,
  boxFromStabilityDays,
  toBinaryResponse,
  type Box,
  type BinaryResponse,
} from './definitions.js';
import type { CardSchedule, LearningState } from './index.js';

/**
 * Scheduler V2 (LB-B35 CP7): GR-1.8 + ENG-DROP, owner decisions 2026-10-01.
 *
 * Binary semantics only. A legacy four-grade answer is projected through the canonical
 * `HISTORICAL_GRADE_PROJECTION` first (`forgot` -> unknown; `hard`/`remembered`/`mastered` -> known), so a
 * mobile client gets exactly the same scheduling as a binary web client. No four-grade behavior survives here.
 *
 * Box is an explicit rule of this scheduler, not something inferred afterwards:
 *   Known   from Box 1            -> Box 2 (stability is lifted to at least one day)
 *   Known   from Box 2..4         -> interval x1.8, never more than one Box up (it may stay in its Box;
 *                                    a second consecutive Known always changes the Box, see tests)
 *   Known   from Box 5            -> Box 5, interval x3, never above 180 days
 *   Unknown from Box 2..5         -> exactly one Box down
 *   Unknown from Box 1            -> Box 1
 * After computing the next schedule, `assertBoxTransition` re-checks the rule against the OUTPUT. A violation
 * throws `SchedulerInvariantError`; callers must refuse the write rather than persist it.
 *
 * Non-inputs: `difficulty`, `lapses`, lateness (`now` only sets `dueAt`) and the compatibility `state`.
 * `difficulty` and `lapses` are still WRITTEN with the same arithmetic as scheduler V1 so the compatibility
 * columns and a code rollback stay coherent, but nothing here reads them to decide a Box or an interval.
 * `state` is written from the rule below and is never read to decide stability or `dueAt` (it is read only to
 * recognise the first review of a new card, which affects the written `state` and nothing else).
 */

export const SCHEDULER_V2_ENGINE_VERSION = 2;

/** Known multiplier below Box 5 (GR-1.8). */
export const V2_KNOWN_FACTOR = 1.8;
/** Known multiplier inside Box 5. */
export const V2_BOX5_FACTOR = 3;
/** Unknown multiplier before it is placed inside the Box one below. */
export const V2_UNKNOWN_FACTOR = 0.35;
/** Box 5 interval cap (owner decision D2). */
export const V2_BOX5_CAP_DAYS = 180;
/** A Known from Box 1 lifts stability to at least this many days (enters Box 2). */
export const V2_GRADUATION_DAYS = 1;
/**
 * Distance kept below a Box's upper edge so a stored `double precision` value can never round onto the edge
 * and into the next Box. Proven to survive a Postgres round trip in the DB suite.
 */
export const V2_EDGE_MARGIN_DAYS = 1e-9;
/** Same 10-minute floor as scheduler V1. */
export const V2_MIN_STABILITY_DAYS = 10 / (24 * 60);

const MINUTE_IN_MS = 60_000;
const DAY_IN_MS = 86_400_000;

export class SchedulerInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulerInvariantError';
  }
}

/** Upper edge (exclusive) of a Box below Box 5, in stability days. */
const upperEdge = (box: Box): number => {
  const edges: readonly number[] = BOX_LOWER_BOUND_DAYS;
  return box >= 5 ? Number.POSITIVE_INFINITY : edges[box]!;
};
/** Lower edge (inclusive) of a Box in stability days. */
const lowerEdge = (box: Box): number => BOX_LOWER_BOUND_DAYS[box - 1]!;

/**
 * Next stability for a Known answer. Always lands inside the Box the rule names, so the transition is
 * decided here by construction and then verified independently by `assertBoxTransition`.
 */
function knownStability(stability: number, box: Box): number {
  if (box === 5) return Math.min(stability * V2_BOX5_FACTOR, V2_BOX5_CAP_DAYS);
  let candidate = stability * V2_KNOWN_FACTOR;
  if (box === 1) candidate = Math.max(candidate, V2_GRADUATION_DAYS);
  const target = (box + 1) as Box;
  // Reaching Box 5 is allowed only through natural growth, and is capped like any Box-5 interval.
  if (target === 5 && candidate >= lowerEdge(5)) return Math.min(candidate, V2_BOX5_CAP_DAYS);
  // Never skip a Box: clamp just under the upper edge of the target Box.
  return Math.min(candidate, upperEdge(target) - V2_EDGE_MARGIN_DAYS);
}

/** Next stability for an Unknown answer: exactly one Box down (Box 1 stays Box 1). */
function unknownStability(stability: number, box: Box): number {
  if (box === 1) return Math.max(stability * V2_UNKNOWN_FACTOR, V2_MIN_STABILITY_DAYS);
  const target = (box - 1) as Box;
  const placed = Math.max(stability * V2_UNKNOWN_FACTOR, lowerEdge(target));
  return Math.min(placed, upperEdge(target) - V2_EDGE_MARGIN_DAYS);
}

/**
 * The compatibility `state` for the schedule being written (owner decision 2026-10-01).
 * First review of a new card -> learning (either answer); later Unknown -> relearning; Known landing in
 * Box 5 -> mastered; any other Known -> review. Non-authoritative: no Box or interval ever depends on it.
 */
export function stateAfterBinaryReview(
  previous: LearningState,
  response: BinaryResponse,
  nextBox: Box,
): LearningState {
  if (previous === 'new') return 'learning';
  if (response === 'unknown') return 'relearning';
  return nextBox === 5 ? 'mastered' : 'review';
}

/**
 * Re-check a transition against the rule, from the OUTPUT. This is deliberately written without calling the
 * functions above, so a bug there cannot also hide here.
 */
export function assertBoxTransition(input: {
  before: Box;
  response: BinaryResponse;
  after: Box;
  nextStabilityDays: number;
  nextDueAt: Date;
  now: Date;
}): void {
  const { before, response, after, nextStabilityDays: stability } = input;
  const fail = (rule: string): never => {
    throw new SchedulerInvariantError(
      `Scheduler V2 transition rejected (${rule}): Box ${before} --${response}--> Box ${after}, ` +
        `stability ${stability}`,
    );
  };
  if (!Number.isFinite(stability) || stability <= 0) fail('stability must be finite and positive');
  if (stability < V2_MIN_STABILITY_DAYS - 1e-15) fail('stability below the 10-minute floor');
  if (!(input.nextDueAt.getTime() > input.now.getTime())) fail('due date must be after now');
  if (response === 'known') {
    if (after < before) fail('a Known answer never lowers the Box');
    if (after > before + 1) fail('a Known answer raises the Box by at most one');
    if (before === 1 && after < 2) fail('a Known answer from Box 1 enters Box 2');
    if (before === 5 && (after !== 5 || stability > V2_BOX5_CAP_DAYS))
      fail('Box 5 stays Box 5 and is capped at 180 days');
  } else if (before === 1) {
    if (after !== 1) fail('an Unknown answer in Box 1 stays in Box 1');
  } else if (after !== before - 1) {
    fail('an Unknown answer lowers the Box by exactly one');
  }
}

/**
 * Turns a PROPOSED next stability into a schedule, but only after `assertBoxTransition` has accepted it.
 * This is the single gate every V2 schedule passes through; it is exported so the proof suite can feed it
 * invalid proposals and show that nothing is returned (callers then persist nothing).
 */
export function finalizeBinarySchedule(
  schedule: CardSchedule,
  response: BinaryResponse,
  proposedStabilityDays: number,
  now: Date,
): CardSchedule {
  if (!Number.isFinite(proposedStabilityDays) || proposedStabilityDays <= 0) {
    throw new SchedulerInvariantError(
      `Scheduler V2 refused a proposed stability that is not finite and positive (${proposedStabilityDays}).`,
    );
  }
  const before = boxFromStabilityDays(schedule.stabilityDays);
  const dueAt = new Date(now.getTime() + Math.max(MINUTE_IN_MS, proposedStabilityDays * DAY_IN_MS));
  const after = boxFromStabilityDays(proposedStabilityDays);
  assertBoxTransition({
    before,
    response,
    after,
    nextStabilityDays: proposedStabilityDays,
    nextDueAt: dueAt,
    now,
  });
  const isUnknown = response === 'unknown';
  return {
    ...schedule,
    state: stateAfterBinaryReview(schedule.state, response, after),
    stabilityDays: proposedStabilityDays,
    // Compatibility columns, same arithmetic as scheduler V1. Never read to schedule.
    difficulty: Math.min(10, Math.max(1, schedule.difficulty + (isUnknown ? 0.5 : -0.1))),
    lapses: schedule.lapses + Number(isUnknown),
    dueAt,
  };
}

/**
 * Scheduler V2. Pure and total over valid schedules; throws `SchedulerInvariantError` for an invalid input
 * stability or an output that breaks the Box rule. The caller must NOT persist anything when it throws.
 */
export function scheduleBinaryReview(
  schedule: CardSchedule,
  answer: { grade: string; response?: BinaryResponse },
  now: Date,
): CardSchedule {
  const response = answer.response ?? toBinaryResponse(answer.grade);
  const stability = schedule.stabilityDays;
  if (!Number.isFinite(stability) || stability <= 0) {
    throw new SchedulerInvariantError(
      `Scheduler V2 refused an invalid stored stability (${stability}).`,
    );
  }
  const before = boxFromStabilityDays(stability);
  const proposed =
    response === 'known' ? knownStability(stability, before) : unknownStability(stability, before);
  return finalizeBinarySchedule(schedule, response, proposed, now);
}
