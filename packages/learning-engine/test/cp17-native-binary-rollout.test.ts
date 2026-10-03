import { describe, expect, it } from 'vitest';

import {
  assessRollout,
  canAdvance,
  STAGE_EVIDENCE,
  type ClientBuildState,
  type FleetState,
  type ServerBinaryState,
} from '../src/native-binary-rollout.js';

const server = (overrides: Partial<ServerBinaryState> = {}): ServerBinaryState => ({
  acceptanceEnabled: false,
  creationEnabled: false,
  binarySchemaApplied: true,
  ...overrides,
});

const client = (overrides: Partial<ClientBuildState> = {}): ClientBuildState => ({
  binaryUiCompiledIn: false,
  realTransportWired: true,
  honoursRuntimeKillSwitch: true,
  ...overrides,
});

const fleet = (overrides: Partial<FleetState> = {}): FleetState => ({
  binaryEventsCreated: false,
  binaryEventsQueued: false,
  ...overrides,
});

describe('CP17 — server-before-client enforcement', () => {
  it('refuses a binary-capable client against a server that cannot accept', () => {
    const result = assessRollout(
      server({ acceptanceEnabled: false }),
      client({ binaryUiCompiledIn: true }),
      fleet(),
    );
    expect(result.blockers.join(' ')).toContain('Server-before-client violated');
  });

  it('allows a binary-capable client once acceptance is ON', () => {
    const result = assessRollout(
      server({ acceptanceEnabled: true }),
      client({ binaryUiCompiledIn: true }),
      fleet(),
    );
    expect(result.blockers).toEqual([]);
    expect(result.stage).toBe('armed');
  });

  it('refuses acceptance on a pre-0023 schema (CP8 finding N1)', () => {
    const result = assessRollout(
      server({ acceptanceEnabled: true, binarySchemaApplied: false }),
      client(),
      fleet(),
    );
    expect(result.blockers.join(' ')).toContain('migration 0023');
  });

  it('refuses creation advertised above acceptance', () => {
    const result = assessRollout(
      server({ acceptanceEnabled: false, creationEnabled: true }),
      client(),
      fleet(),
    );
    expect(result.blockers.join(' ')).toContain('creation without acceptance');
  });
});

describe('CP17 — client readiness gates', () => {
  it('refuses a binary client with no real transport (the CP16 parity gap)', () => {
    const result = assessRollout(
      server({ acceptanceEnabled: true }),
      client({ binaryUiCompiledIn: true, realTransportWired: false }),
      fleet(),
    );
    expect(result.blockers.join(' ')).toContain('no real review-sync transport');
  });

  it('refuses a binary client that cannot be killed at runtime', () => {
    const result = assessRollout(
      server({ acceptanceEnabled: true }),
      client({ binaryUiCompiledIn: true, honoursRuntimeKillSwitch: false }),
      fleet(),
    );
    expect(result.blockers.join(' ')).toContain('runtime kill switch');
  });
});

describe('CP17 — configuration drift', () => {
  it('refuses an acceptance regression while binary events are still queued', () => {
    const result = assessRollout(
      server({ acceptanceEnabled: false }),
      client(),
      fleet({ binaryEventsCreated: true, binaryEventsQueued: true }),
    );
    expect(result.blockers.join(' ')).toContain('acceptance regressed');
  });
});

describe('CP17 — stage derivation and the one-way boundary', () => {
  it('dormant when nothing is enabled', () => {
    expect(assessRollout(server(), client(), fleet()).stage).toBe('dormant');
  });

  it('serverReady once acceptance is ON but no binary client exists', () => {
    const result = assessRollout(server({ acceptanceEnabled: true }), client(), fleet());
    expect(result.stage).toBe('serverReady');
    expect(result.downgradeSafe).toBe(true);
  });

  it('armed is the LAST stage from which downgrade is still safe', () => {
    const result = assessRollout(
      server({ acceptanceEnabled: true }),
      client({ binaryUiCompiledIn: true }),
      fleet(),
    );
    expect(result.stage).toBe('armed');
    expect(result.downgradeSafe).toBe(true);
    expect(result.pointOfNoReturnCrossed).toBe(false);
    expect(result.warnings.join(' ')).toContain('last stage');
  });

  it('creating crosses the one-way boundary', () => {
    const result = assessRollout(
      server({ acceptanceEnabled: true, creationEnabled: true }),
      client({ binaryUiCompiledIn: true }),
      fleet({ binaryEventsCreated: true, binaryEventsQueued: true }),
    );
    expect(result.stage).toBe('creating');
    expect(result.pointOfNoReturnCrossed).toBe(true);
    expect(result.downgradeSafe).toBe(false);
  });

  it('CP17 F3: quarantine alone no longer crosses the boundary', () => {
    // Pre-fix, quarantine state bumped the queue envelope to v2 and made a downgrade
    // destructive even with zero binary reviews. Quarantine is no longer in the envelope,
    // so with no binary events created the downgrade stays safe.
    const result = assessRollout(
      server({ acceptanceEnabled: true }),
      client({ binaryUiCompiledIn: true }),
      fleet({ binaryEventsCreated: false, binaryEventsQueued: false }),
    );
    expect(result.downgradeSafe).toBe(true);
    expect(result.pointOfNoReturnCrossed).toBe(false);
  });

  it('draining once creation is withdrawn but binary events exist', () => {
    const result = assessRollout(
      server({ acceptanceEnabled: true, creationEnabled: false }),
      client({ binaryUiCompiledIn: true }),
      fleet({ binaryEventsCreated: true, binaryEventsQueued: true }),
    );
    expect(result.stage).toBe('draining');
    // Acceptance stays ON, so the queue can drain and nothing is stranded.
    expect(result.blockers).toEqual([]);
  });
});

describe('CP17 — stage transitions', () => {
  const clean = assessRollout(server({ acceptanceEnabled: true }), client(), fleet());

  it('refuses to skip a stage', () => {
    expect(canAdvance('dormant', 'creating', clean).allowed).toBe(false);
    expect(canAdvance('dormant', 'creating', clean).reasons.join(' ')).toContain(
      'Cannot skip stages',
    );
  });

  it('allows a single clean step forward', () => {
    expect(canAdvance('dormant', 'serverReady', clean).allowed).toBe(true);
  });

  it('refuses any advance while a blocker exists', () => {
    const blocked = assessRollout(
      server({ acceptanceEnabled: false }),
      client({ binaryUiCompiledIn: true }),
      fleet(),
    );
    expect(canAdvance('serverReady', 'armed', blocked).allowed).toBe(false);
  });

  it('refuses retreat after the boundary, but ALWAYS allows the kill switch', () => {
    const crossed = assessRollout(
      server({ acceptanceEnabled: true, creationEnabled: true }),
      client({ binaryUiCompiledIn: true }),
      fleet({ binaryEventsCreated: true, binaryEventsQueued: true }),
    );
    // Retreating to a pre-binary stage is unsafe...
    expect(canAdvance('creating', 'armed', crossed).allowed).toBe(false);
    // ...but withdrawing creation (the kill switch) must never be blocked.
    expect(canAdvance('creating', 'draining', crossed).allowed).toBe(true);
  });

  it('allows retreat freely before the boundary', () => {
    expect(canAdvance('armed', 'serverReady', clean).allowed).toBe(true);
  });
});

describe('CP17 — operator evidence is defined for every stage', () => {
  it('requires owner authorisation exactly where the boundary is crossed', () => {
    expect(STAGE_EVIDENCE.creating.join(' ')).toContain('Owner authorisation');
  });

  it('defines evidence for every stage that changes state', () => {
    for (const stage of ['serverReady', 'armed', 'creating', 'draining'] as const) {
      expect(STAGE_EVIDENCE[stage].length).toBeGreaterThan(0);
    }
  });
});
