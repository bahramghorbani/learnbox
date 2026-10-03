/**
 * CP17 — Native Binary rollout preflight and rollout state machine.
 *
 * Why this exists as code rather than a runbook: CP16 review found that every ordering
 * guarantee for the Native binary rollout depended on an operator remembering the rules.
 * This module makes the rules mechanical, so a release gate can assert them and CI can
 * regression-test them.
 *
 * It computes decisions only. It reads no environment, performs no I/O, mutates nothing and
 * never activates anything.
 */

/** Server-side acceptance/creation signals, as observed on the target environment. */
export interface ServerBinaryState {
  /** `LEARNBOX_BINARY_REVIEW === 'true'` — the server will ACCEPT binary events. */
  readonly acceptanceEnabled: boolean;
  /** `LEARNBOX_BINARY_REVIEW_CREATION !== 'false'` — clients may CREATE binary events. */
  readonly creationEnabled: boolean;
  /** Migration 0023 (binary columns) is applied. Acceptance without it answers 503. */
  readonly binarySchemaApplied: boolean;
}

/** The client build a rollout stage would distribute. */
export interface ClientBuildState {
  /** Built with `LEARNBOX_MOBILE_BINARY_REVIEW_UI=true`. */
  readonly binaryUiCompiledIn: boolean;
  /** Build sends review events through a real transport (not DisabledReviewSyncTransport). */
  readonly realTransportWired: boolean;
  /** Build honours the server's runtime kill switch (CP17 F2). */
  readonly honoursRuntimeKillSwitch: boolean;
}

/** Observed fleet/queue facts needed to decide whether a downgrade is still safe. */
export interface FleetState {
  /** Any binary event has been created on at least one device. */
  readonly binaryEventsCreated: boolean;
  /** Any binary event is still queued locally and unacknowledged. */
  readonly binaryEventsQueued: boolean;
}

/**
 * Rollout stages. The one-way boundary sits between `armed` and `creating`: before it, a
 * downgrade to a pre-CP16 build is safe; after it, only forward recovery is safe.
 */
export type RolloutStage =
  /** A — nothing enabled anywhere. Server rejects binary, no binary client distributed. */
  | 'dormant'
  /** B — server accepts binary, but no binary-capable client exists yet. Safe, reversible. */
  | 'serverReady'
  /** C — a binary-capable client is distributed but creation is withheld by the server. */
  | 'armed'
  /** D — binary events are being created. ONE-WAY BOUNDARY CROSSED. */
  | 'creating'
  /** E — creation withdrawn by kill switch while queued binary events still drain. */
  | 'draining';

export interface RolloutAssessment {
  readonly stage: RolloutStage;
  /** A pre-CP16 Native build can still be installed without data loss. */
  readonly downgradeSafe: boolean;
  /** The one-way boundary has been crossed; only forward recovery is safe. */
  readonly pointOfNoReturnCrossed: boolean;
  /** Blocking reasons. Empty means this state is internally consistent and safe. */
  readonly blockers: readonly string[];
  /** Non-blocking observations an operator must still see. */
  readonly warnings: readonly string[];
}

/**
 * Preflight for distributing a binary-capable client against a given server state.
 *
 * Server-before-client: a binary-capable client must never be released against a server that
 * cannot accept its events, because the client would queue events the server refuses.
 */
export function assessRollout(
  server: ServerBinaryState,
  client: ClientBuildState,
  fleet: FleetState,
): RolloutAssessment {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Acceptance on a pre-0023 schema answers 503 for every binary event (CP8 finding N1).
  if (server.acceptanceEnabled && !server.binarySchemaApplied) {
    blockers.push(
      'Server acceptance is ON but the binary schema (migration 0023) is not applied: ' +
        'every binary event would fail with 503. Apply 0023 before enabling acceptance.',
    );
  }

  // Creation must never exceed acceptance, or clients create events the server refuses.
  if (server.creationEnabled && !server.acceptanceEnabled) {
    blockers.push(
      'Server advertises creation without acceptance: clients would create binary events ' +
        'the server rejects. Creation must never exceed acceptance.',
    );
  }

  // SERVER BEFORE CLIENT — the core ordering rule.
  if (client.binaryUiCompiledIn && !server.acceptanceEnabled) {
    blockers.push(
      'Server-before-client violated: a binary-capable client must not be released against ' +
        'a server that cannot accept binary events.',
    );
  }

  // A binary client with no real transport cannot sync at all (CP16 parity gap, F4).
  if (client.binaryUiCompiledIn && !client.realTransportWired) {
    blockers.push(
      'Client compiles in the binary UI but wires no real review-sync transport: binary ' +
        'events would be created locally and never reach the server.',
    );
  }

  // Without the runtime switch, the only rollback is a store rebuild/review cycle.
  if (client.binaryUiCompiledIn && !client.honoursRuntimeKillSwitch) {
    blockers.push(
      'Client compiles in the binary UI but does not honour the runtime kill switch: the ' +
        'only rollback would be a store rebuild, which is not an emergency mechanism.',
    );
  }

  // Configuration drift: acceptance regressed while binary events are still in flight.
  if (!server.acceptanceEnabled && fleet.binaryEventsQueued) {
    blockers.push(
      'Server acceptance regressed while binary events are still queued: those events ' +
        'cannot drain. Restore acceptance until the queues are empty.',
    );
  }

  const stage = deriveStage(server, client, fleet);
  // Only ACTUAL binary evidence crosses the boundary. CP17 F3 removed quarantine from the
  // queue envelope, so quarantine state alone no longer makes a downgrade unsafe.
  const pointOfNoReturnCrossed = fleet.binaryEventsCreated;

  if (fleet.binaryEventsQueued && !server.acceptanceEnabled) {
    warnings.push('Queued binary events exist; keep acceptance ON until they have drained.');
  }
  if (stage === 'armed') {
    warnings.push(
      'Client is distributed but creation is withheld: this is the last stage from which a ' +
        'downgrade is still safe.',
    );
  }

  return {
    stage,
    downgradeSafe: !pointOfNoReturnCrossed,
    pointOfNoReturnCrossed,
    blockers,
    warnings,
  };
}

function deriveStage(
  server: ServerBinaryState,
  client: ClientBuildState,
  fleet: FleetState,
): RolloutStage {
  if (fleet.binaryEventsCreated && !server.creationEnabled) return 'draining';
  if (server.creationEnabled && client.binaryUiCompiledIn) return 'creating';
  if (client.binaryUiCompiledIn) return 'armed';
  if (server.acceptanceEnabled) return 'serverReady';
  return 'dormant';
}

/** Stage order; advancing more than one step at a time is refused. */
const STAGE_ORDER: readonly RolloutStage[] = [
  'dormant',
  'serverReady',
  'armed',
  'creating',
  'draining',
];

export interface StageTransition {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
}

/**
 * Whether advancing from `from` to `to` is permitted.
 *
 * Advancing requires a clean preflight and exactly one step, so no stage is skipped.
 * Retreating is permitted only while the one-way boundary has not been crossed, except for
 * the `creating` -> `draining` retreat, which is precisely the kill-switch path.
 */
export function canAdvance(
  from: RolloutStage,
  to: RolloutStage,
  assessment: RolloutAssessment,
): StageTransition {
  const reasons: string[] = [];
  const fromIndex = STAGE_ORDER.indexOf(from);
  const toIndex = STAGE_ORDER.indexOf(to);

  if (assessment.blockers.length > 0) {
    reasons.push(...assessment.blockers);
  }

  if (toIndex > fromIndex) {
    if (toIndex - fromIndex > 1) {
      reasons.push(`Cannot skip stages: ${from} -> ${to}.`);
    }
  } else if (toIndex < fromIndex) {
    // The kill-switch retreat is always allowed: it is the emergency mechanism.
    const isKillSwitchRetreat = from === 'creating' && to === 'draining';
    if (!isKillSwitchRetreat && assessment.pointOfNoReturnCrossed) {
      reasons.push(
        'The one-way boundary has been crossed (binary events exist): retreat to ' +
          `${to} is unsafe. Only forward recovery or the kill switch is available.`,
      );
    }
  }

  return { allowed: reasons.length === 0, reasons };
}

/** Evidence an operator must present before advancing INTO each stage. */
export const STAGE_EVIDENCE: Readonly<Record<RolloutStage, readonly string[]>> = {
  dormant: [],
  serverReady: [
    'Migration 0023 applied and verified on the target environment.',
    'LEARNBOX_BINARY_REVIEW=true verified by reading the running container environment.',
    'Legacy four-grade clients verified still serviceable after the flag change.',
  ],
  armed: [
    'Client build honours the runtime kill switch and wires a real sync transport.',
    'Server acceptance verified ON immediately before distribution.',
    'LEARNBOX_BINARY_REVIEW_CREATION=false set, so the distributed build creates nothing yet.',
    'Downgrade to the previous Native build verified safe (no binary events exist).',
  ],
  creating: [
    'Owner authorisation for crossing the one-way boundary.',
    'Mixed legacy/binary batch sync verified end to end against the target environment.',
    'Kill-switch drill performed: creation withdrawn and queued events still drained.',
  ],
  draining: [
    'Creation withdrawn via LEARNBOX_BINARY_REVIEW_CREATION=false.',
    'Acceptance confirmed still ON so queued binary events can drain.',
    'Queue depth observed falling to zero before any further change.',
  ],
};
