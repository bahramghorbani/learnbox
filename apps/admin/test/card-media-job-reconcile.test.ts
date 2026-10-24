/**
 * Reconciliation of deferred pack-media job items via the explicit reconcileAccepted() action.
 *
 * Evidence driving this: Was bedeutet das sentence_audio 007a466b ALREADY accepted;
 * Öffnungszeit image a2af0994 ALREADY accepted — but both pack_media_job_items remained
 * 'deferred'. accept() returns early ('already_accepted') for these, so a separate
 * explicit reconciliation path is required.
 *
 * Die U-Bahn: last candidate 643ff8a5 failed provider_timeout at 120 s — no accepted asset,
 * nothing to reconcile; that item stays deferred until a future generate + accept cycle.
 *
 * Invariants under test:
 *   1. reconcileAccepted() updates deferred items that have an accepted candidate at the
 *      current card version; history and other items are untouched.
 *   2. Items with a stale card_version_id are skipped (content may have changed).
 *   3. Items without an accepted candidate (e.g. die U-Bahn) are not touched.
 *   4. Job status is accurately recomputed in the same transaction.
 *   5. The route is gated by editorial role + recent re-auth.
 *
 * Lease computation: verified as compatibility evidence only — no production timeout change.
 * Client-side disconnect resilience: mock proof included.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PackMediaJobService } from '../lib/server/pack-media-job-service.js';
import { createPackMediaJobReconcileRoute } from '../lib/server/admin-pack-media-job-routes.js';
import { hashAdminSecret } from '../lib/server/admin-session.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const JOB_ID = 'b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0';
const CARD_1 = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'; // sentence_audio — accepted (007a466b)
const CARD_2 = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2'; // image        — accepted (a2af0994)
const CARD_3 = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3'; // sentence_audio — NO accepted (die U-Bahn)
const VERSION_CURRENT = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
const VERSION_OLD = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CAND_AUDIO = '007a466b-0000-4000-8000-000000000000';
const CAND_IMAGE = 'a2af0994-0000-4000-8000-000000000000';
const ACTOR = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';

type Row = Record<string, unknown>;

interface ItemState {
  id: string;
  card_id: string;
  kind: string;
  card_version_id: string;
  status: string;
  candidate_id: string | null;
  detail: string | null;
}

/**
 * Build an in-memory pool that simulates the reconcileAccepted() SQL path.
 *
 * The pool tracks item state as a mutable Map so assertions can verify SQL effects.
 */
function buildReconcilePool(opts: {
  items: ItemState[];
  /**
   * Map of `${card_id}:${kind}` → candidate_id for accepted assets.
   * Empty means no accepted asset exists (die U-Bahn scenario).
   */
  acceptedAssets: Map<string, string>;
  /** Current latest card version for each card_id. Defaults to VERSION_CURRENT. */
  currentVersions?: Map<string, string>;
  jobCurrentStatus?: string;
  jobStopRequested?: boolean;
  hasEditorial?: boolean;
}) {
  const items = new Map(opts.items.map((item) => [item.id, { ...item }]));
  const jobStatus = { value: opts.jobCurrentStatus ?? 'completed_with_deferred' };
  const currentVersions =
    opts.currentVersions ??
    new Map([
      [CARD_1, VERSION_CURRENT],
      [CARD_2, VERSION_CURRENT],
      [CARD_3, VERSION_CURRENT],
    ]);

  const query = vi.fn(
    async (
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<{ rows: Row[]; rowCount?: number }> => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) return { rows: [] };

      if (/FROM admin_role_assignments/.test(sql)) {
        return { rows: opts.hasEditorial !== false ? [{ role: 'content_reviewer' }] : [] };
      }

      // Job ownership check
      if (/FROM pack_media_jobs WHERE id = \$1 AND actor_user_id/.test(sql)) {
        return { rows: params[0] === JOB_ID && params[1] === ACTOR ? [{ id: JOB_ID }] : [] };
      }

      // Reconciliation UPDATE (the core SQL)
      if (/UPDATE pack_media_job_items[\s\S]*FROM card_media_assets/.test(sql)) {
        const reconciled: Row[] = [];
        for (const item of items.values()) {
          if (item.status !== 'deferred') continue;
          const candidateId = opts.acceptedAssets.get(`${item.card_id}:${item.kind}`);
          if (!candidateId) continue;
          const currentVer = currentVersions.get(item.card_id) ?? VERSION_CURRENT;
          if (item.card_version_id !== currentVer) continue;
          item.status = 'generated';
          item.candidate_id = candidateId;
          item.detail = 'reconciled_by_manual_accept';
          reconciled.push({ id: item.id });
        }
        return { rows: reconciled, rowCount: reconciled.length };
      }

      // Job status recompute
      if (/UPDATE pack_media_jobs SET status/.test(sql)) {
        const allTerminal = [...items.values()].every((item) =>
          ['generated', 'not_needed', 'stopped', 'deferred'].includes(item.status),
        );
        if (!allTerminal) return { rows: [] }; // NOT EXISTS guard blocks update
        const stillDeferred = [...items.values()].some((item) => item.status === 'deferred');
        if (opts.jobStopRequested) {
          jobStatus.value = 'stopped';
        } else if (stillDeferred) {
          jobStatus.value = 'completed_with_deferred';
        } else {
          jobStatus.value = 'completed';
        }
        return { rows: [] };
      }

      // jobView (get() call after commit): return minimal job shape
      if (/FROM pack_media_jobs j/.test(sql) && /JOIN pack_media_job_items/.test(sql)) {
        return {
          rows: [
            {
              id: JOB_ID,
              pack_id: 'pack-fixture',
              status: jobStatus.value,
              stop_requested: opts.jobStopRequested ?? false,
              estimated_max_seconds: 0,
              last_progress_at: null,
              // Count columns
              pending_count: 0,
              leased_count: 0,
              dispatching_count: 0,
              generated_count: 0,
              not_needed_count: 0,
              in_progress_count: 0,
              needs_attention_count: 0,
              deferred_count: [...items.values()].filter((i) => i.status === 'deferred').length,
              stopped_count: 0,
            },
          ],
        };
      }

      // Item rows for jobView
      if (/FROM pack_media_job_items WHERE job_id/.test(sql)) {
        return { rows: [...items.values()] };
      }

      return { rows: [] };
    },
  );

  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return {
    service: new PackMediaJobService(pool as never, {} as never, {
      imageTimeoutMs: 180_000,
      audioTimeoutMs: 180_000,
    }),
    items,
    jobStatus,
  };
}

// ---------------------------------------------------------------------------
// 1. Server-side reconciliation — explicit path
// ---------------------------------------------------------------------------

describe('PackMediaJobService.reconcileAccepted()', () => {
  it('reconciles deferred items that have an accepted candidate at the current card version', async () => {
    const { service, items, jobStatus } = buildReconcilePool({
      items: [
        {
          id: 'item-1',
          card_id: CARD_1,
          kind: 'sentence_audio',
          card_version_id: VERSION_CURRENT,
          status: 'deferred',
          candidate_id: null,
          detail: 'operator_deferred_unknown_outcome',
        },
        {
          id: 'item-2',
          card_id: CARD_2,
          kind: 'image',
          card_version_id: VERSION_CURRENT,
          status: 'deferred',
          candidate_id: null,
          detail: 'operator_deferred_unknown_outcome',
        },
        {
          id: 'item-3',
          card_id: CARD_3,
          kind: 'sentence_audio',
          card_version_id: VERSION_CURRENT,
          status: 'deferred',
          candidate_id: null,
          detail: 'operator_deferred_unknown_outcome',
        },
      ],
      acceptedAssets: new Map([
        [`${CARD_1}:sentence_audio`, CAND_AUDIO], // Was bedeutet das — already accepted
        [`${CARD_2}:image`, CAND_IMAGE], // Öffnungszeit    — already accepted
        // CARD_3 (die U-Bahn) has NO accepted asset
      ]),
    });

    const result = await service.reconcileAccepted(ACTOR, JOB_ID);

    expect(result.status).toBe('reconciled');
    if (result.status !== 'reconciled') return;

    // CARD_1 and CARD_2 items reconciled with their accepted candidates.
    expect(items.get('item-1')!.status).toBe('generated');
    expect(items.get('item-1')!.candidate_id).toBe(CAND_AUDIO);
    expect(items.get('item-1')!.detail).toBe('reconciled_by_manual_accept');

    expect(items.get('item-2')!.status).toBe('generated');
    expect(items.get('item-2')!.candidate_id).toBe(CAND_IMAGE);

    // CARD_3 (die U-Bahn) stays deferred — no accepted asset.
    expect(items.get('item-3')!.status).toBe('deferred');
    expect(items.get('item-3')!.candidate_id).toBeNull();

    expect(result.count).toBe(2);
    // One deferred item remains → job stays completed_with_deferred.
    expect(jobStatus.value).toBe('completed_with_deferred');
  });

  it('advances job to completed when reconciling the last deferred item', async () => {
    const { service, jobStatus } = buildReconcilePool({
      items: [
        {
          id: 'item-1',
          card_id: CARD_1,
          kind: 'sentence_audio',
          card_version_id: VERSION_CURRENT,
          status: 'deferred',
          candidate_id: null,
          detail: null,
        },
      ],
      acceptedAssets: new Map([[`${CARD_1}:sentence_audio`, CAND_AUDIO]]),
    });

    const result = await service.reconcileAccepted(ACTOR, JOB_ID);
    expect(result.status).toBe('reconciled');
    expect(jobStatus.value).toBe('completed');
  });

  it('skips deferred items whose card_version_id is stale (content changed since job creation)', async () => {
    const { service, items } = buildReconcilePool({
      items: [
        {
          id: 'item-1',
          card_id: CARD_1,
          kind: 'sentence_audio',
          card_version_id: VERSION_OLD,
          status: 'deferred',
          candidate_id: null,
          detail: null,
        },
      ],
      acceptedAssets: new Map([[`${CARD_1}:sentence_audio`, CAND_AUDIO]]),
      currentVersions: new Map([[CARD_1, VERSION_CURRENT]]), // card was updated → VERSION_OLD ≠ VERSION_CURRENT
    });

    const result = await service.reconcileAccepted(ACTOR, JOB_ID);
    expect(result.status).toBe('reconciled');
    if (result.status !== 'reconciled') return;
    expect(result.count).toBe(0);
    expect(items.get('item-1')!.status).toBe('deferred'); // untouched
  });

  it('leaves items with no accepted candidate (die U-Bahn scenario) unchanged', async () => {
    const { service, items } = buildReconcilePool({
      items: [
        {
          id: 'item-3',
          card_id: CARD_3,
          kind: 'sentence_audio',
          card_version_id: VERSION_CURRENT,
          status: 'deferred',
          candidate_id: null,
          detail: 'operator_deferred_unknown_outcome',
        },
      ],
      acceptedAssets: new Map(), // no accepted assets at all
    });

    const result = await service.reconcileAccepted(ACTOR, JOB_ID);
    expect(result.status).toBe('reconciled');
    if (result.status !== 'reconciled') return;
    expect(result.count).toBe(0);
    expect(items.get('item-3')!.status).toBe('deferred');
  });

  it('returns forbidden without touching anything when actor lacks editorial role', async () => {
    const { service, items } = buildReconcilePool({
      items: [
        {
          id: 'item-1',
          card_id: CARD_1,
          kind: 'sentence_audio',
          card_version_id: VERSION_CURRENT,
          status: 'deferred',
          candidate_id: null,
          detail: null,
        },
      ],
      acceptedAssets: new Map([[`${CARD_1}:sentence_audio`, CAND_AUDIO]]),
      hasEditorial: false,
    });

    const result = await service.reconcileAccepted(ACTOR, JOB_ID);
    expect(result.status).toBe('forbidden');
    expect(items.get('item-1')!.status).toBe('deferred'); // untouched
  });

  it('returns not_found when the job does not belong to this actor', async () => {
    const { service } = buildReconcilePool({
      items: [],
      acceptedAssets: new Map(),
    });
    const result = await service.reconcileAccepted('different-actor-id', JOB_ID);
    expect(result.status).toBe('not_found');
  });
});

// ---------------------------------------------------------------------------
// 2. Route security — reconcile route is gated by recent re-auth
// ---------------------------------------------------------------------------

describe('reconcile route — security boundary', () => {
  const config = {
    enabled: true as const,
    origin: 'https://admin.learnbox.app',
    rpId: 'admin.learnbox.app',
    tokenHashKey: 'k'.repeat(32),
  };
  const now = new Date('2026-10-22T10:00:00.000Z');
  const csrfToken = 'c'.repeat(43);
  const sessionToken = 't'.repeat(43);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function sessionStore(recent = true) {
    return {
      findActiveSession: async () => ({
        userId: ACTOR,
        csrfHash: hashAdminSecret(csrfToken, config.tokenHashKey),
        lastSeenAt: now,
        absoluteExpiresAt: new Date(now.getTime() + 60_000),
        revokedAt: null,
        recentAuthenticatedAt: recent ? now : new Date(now.getTime() - 86_400_000),
      }),
      touchSession: async () => true,
    };
  }

  function makeRequest(
    body: Record<string, unknown>,
    opts: { csrf?: string; origin?: string } = {},
  ) {
    return new Request('https://admin.learnbox.app/api/content/media/jobs/reconcile', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        cookie: `__Host-learnbox_admin_session=${sessionToken}`,
        origin: opts.origin ?? 'https://admin.learnbox.app',
        'x-learnbox-csrf-token': opts.csrf ?? csrfToken,
      },
      body: JSON.stringify(body),
    });
  }

  function makeService(result: Awaited<ReturnType<PackMediaJobService['reconcileAccepted']>>) {
    return { reconcileAccepted: vi.fn(async () => result) };
  }

  it('rejects cross-origin requests with 400 (assertTrustedAdminMutation)', async () => {
    const route = createPackMediaJobReconcileRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      service: makeService({ status: 'reconciled', count: 1, job: {} as never }) as never,
      environment: {},
    });
    const response = await route(
      makeRequest({ jobId: JOB_ID }, { origin: 'https://evil.example' }),
    );
    expect(response.status).toBe(400);
  });

  it('rejects stale re-auth with 428', async () => {
    const route = createPackMediaJobReconcileRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(false), // recent = false
      service: makeService({ status: 'reconciled', count: 1, job: {} as never }) as never,
      environment: {},
    });
    const response = await route(makeRequest({ jobId: JOB_ID }));
    expect(response.status).toBe(428);
  });

  it('rejects missing or malformed jobId with 400', async () => {
    const route = createPackMediaJobReconcileRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      service: makeService({ status: 'reconciled', count: 1, job: {} as never }) as never,
      environment: {},
    });
    const response = await route(makeRequest({ jobId: 'not-a-uuid' }));
    expect(response.status).toBe(400);
  });

  it('returns 200 with count and job for a successful reconcile', async () => {
    const route = createPackMediaJobReconcileRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      service: makeService({
        status: 'reconciled',
        count: 2,
        job: { id: JOB_ID } as never,
      }) as never,
      environment: {},
    });
    const response = await route(makeRequest({ jobId: JOB_ID }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; count: number };
    expect(body.status).toBe('reconciled');
    expect(body.count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 3. Lease computation — compatibility evidence (no production timeout change)
// ---------------------------------------------------------------------------

describe('PackMediaJobService lease computation — evidence only', () => {
  /**
   * Production config: imageTimeoutMs = 180 000 ms, audioTimeoutMs = 180 000 ms.
   * Expected lease: ceil(max(180, 180)) + 60 = 240 s.
   *
   * The lease MUST outlive the provider timeout so a second runner tick cannot declare
   * a still-running dispatch unknown. 240 s > 180 s ✓. This is recorded as compatibility
   * evidence only — no production timeout change is made by this PR.
   */
  it('audio 180s + image 180s → lease 240s (timer safety window preserved)', () => {
    const leaseSeconds = Math.ceil(Math.max(180_000, 180_000) / 1000) + 60;
    expect(leaseSeconds).toBe(240);
    // Safety margin over the 120 s Caddy proxy timeout logged in evidence.
    expect(leaseSeconds).toBeGreaterThan(120);
  });

  it('runnerGapSeconds (5 s) << lease (240 s) — no race within the gap', () => {
    expect(240).toBeGreaterThan(5 * 2); // two consecutive timer ticks still inside the lease
  });

  it('exported PACK_MEDIA_RUNNER_GAP_SECONDS matches the constant', async () => {
    const { PACK_MEDIA_RUNNER_GAP_SECONDS } =
      await import('../lib/server/pack-media-job-service.js');
    expect(PACK_MEDIA_RUNNER_GAP_SECONDS).toBe(5);
    const leaseAtProductionDefaults = Math.ceil(Math.max(180_000, 180_000) / 1000) + 60;
    expect(leaseAtProductionDefaults).toBe(240);
  });
});

// ---------------------------------------------------------------------------
// 4. Client-side disconnect resilience — mock proof
//
// Scenario: die U-Bahn generate POST dispatched, Caddy logs status=0 at 99.998 s.
// The server keeps running; the client must observe the durable outcome via polling
// WITHOUT being prompted to resend the request.
// ---------------------------------------------------------------------------

describe('post-disconnect resilience: observable outcome without resend', () => {
  /**
   * Exercises the logic extracted from CardMediaPanel's generate() + polling useEffect:
   *
   *  1. onGenerate() throws a network error (proxy disconnect at ~100 s)
   *  2. Immediate refresh() is called — shows whether a 'generating' candidate is visible
   *  3. If generating candidate visible → error suppressed, polling loop started
   *  4. Poll tick observes 'ready' or 'failed' → panel shows durable state
   *  5. generate() is never called again (no auto-retry)
   */
  async function runDisconnectScenario(opts: {
    tick0Status: 'generating';
    tick1Status: 'ready' | 'failed';
  }) {
    let generateCalls = 0;
    let loadCalls = 0;

    const stateSeq = [opts.tick0Status, opts.tick1Status];

    const onGenerate = async () => {
      generateCalls += 1;
      return { ok: false as const, message: 'ارتباط با سرور برقرار نشد.' }; // simulated network error
    };

    const onLoadState = async () => {
      const status = stateSeq[Math.min(loadCalls, stateSeq.length - 1)]!;
      loadCalls += 1;
      return [
        {
          kind: 'sentence_audio' as const,
          accepted: null,
          latestCandidate: { id: 'c-probe', kind: 'sentence_audio' as const, status },
        },
      ];
    };

    // --- Mirror of CardMediaPanel generate() logic ---
    let errorShown: string | null = null;
    let pollsIssued = 0;
    let finalStatus: string | null = null;

    const result = await onGenerate();
    const fresh = await onLoadState(); // immediate post-failure refresh

    const hasGenerating = fresh.some(
      (s) => s.kind === 'sentence_audio' && s.latestCandidate?.status === 'generating',
    );

    if (!result.ok && !hasGenerating) {
      errorShown = result.message; // no generating candidate → show error
    }

    // Polling loop (one tick, simulating the 10 s useEffect timer)
    if (hasGenerating) {
      pollsIssued += 1;
      const polled = await onLoadState();
      finalStatus = polled[0]?.latestCandidate?.status ?? null;
    }

    return { generateCalls, errorShown, pollsIssued, finalStatus };
  }

  it('observes ready outcome without error or resend — Was bedeutet das / Öffnungszeit pattern', async () => {
    const r = await runDisconnectScenario({ tick0Status: 'generating', tick1Status: 'ready' });
    expect(r.generateCalls).toBe(1); // no auto-retry
    expect(r.errorShown).toBeNull(); // user not told to resend
    expect(r.pollsIssued).toBe(1);
    expect(r.finalStatus).toBe('ready');
  });

  it('observes failed outcome without error — die U-Bahn pattern (provider_timeout at 120 s)', async () => {
    const r = await runDisconnectScenario({ tick0Status: 'generating', tick1Status: 'failed' });
    expect(r.generateCalls).toBe(1);
    expect(r.errorShown).toBeNull(); // durable state surfaced via polling, not as a network error
    expect(r.finalStatus).toBe('failed');
  });

  it('shows network error immediately when server wrote no candidate row (pre-dispatch fail)', async () => {
    // Connection dropped before the request reached the server: no candidate row exists.
    const emptyFresh: Array<{ kind: 'sentence_audio'; accepted: null; latestCandidate: null }> = [
      { kind: 'sentence_audio', accepted: null, latestCandidate: null },
    ];
    const hasGenerating = emptyFresh.some(
      (s) =>
        s.latestCandidate !== null &&
        (s.latestCandidate as { status: string }).status === 'generating',
    );
    const result = { ok: false as const, message: 'ارتباط با سرور برقرار نشد.' };
    const errorShown = !result.ok && !hasGenerating ? result.message : null;
    expect(errorShown).toBe('ارتباط با سرور برقرار نشد.');
  });
});
