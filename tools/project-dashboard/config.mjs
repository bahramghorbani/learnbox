// LearnBox local dashboard — committed, auditable project-plan source.
//
// Numbers in this file are engineering decisions recorded in the repository,
// NOT live-invented values. Change them only in reviewed, committed edits and
// keep evidence strings truthful. The runtime combines this committed plan with
// live git / gh / repository-file state (see collect.mjs) but never fabricates
// percentages here.

// --- Task status -> percent mapping (transparent, documented) -----------------
// Rationale: a coarse, reviewable lifecycle. 0 = not started; a task only jumps
// to 100 when verifiably merged/closed. In-progress sits at 60 as a neutral
// "working" value; review-requested is higher because concrete reviewable
// output exists. The single active-task percent is looked up from this table.
export const STATUS_TO_PERCENT = {
  blocked: 5,
  queued: 10,
  'not-started': 10,
  planned: 10,
  'in-progress': 60,
  'review-requested': 85,
  done: 100,
  accepted: 100,
};

// MAPPING_DOC drives a small table rendered in the UI so the mapping is visible.
export const MAPPING_DOC = [
  { status: 'not-started / queued / planned', percent: 10 },
  { status: 'blocked', percent: 5 },
  { status: 'in-progress', percent: 60 },
  { status: 'review-requested', percent: 85 },
  { status: 'done / accepted', percent: 100 },
];

// --- Roadmap tasks (source of the completed/current/remaining columns) --------
// Column rule (see compute.classifyTasks): completed = percent 100;
// current = 0 < percent < 100; remaining = percent 0.
export const TASKS = [
  {
    id: 'T4',
    title: 'Beta / load-testing (Stage 24)',
    status: 'in-progress',
    note: 'Loopback-only synthetic load; owner-gated cohort.',
  },
  {
    id: 'T5',
    title: 'Native identity + authenticated transport design',
    status: 'not-started',
    note: 'No design spec yet; next roadmap item.',
  },
  {
    id: 'T6',
    title: 'Physical low-end audio QA expansion',
    status: 'queued',
    note: 'Blocked by native media audio review.',
  },
  {
    id: 'T7',
    title: 'Cafe Bazaar release signing + listing',
    status: 'blocked',
    note: 'Owner-gated production release.',
  },
];

export const ACTIVE_TASK_ID = 'CURRENT-BRANCH'; // live branch wins; current roadmap is fallback.

// --- Cafe Bazaar release readiness: committed auditable weighted checklist ----
// Weights sum to 100. `met` is a committed assertion with truthful `evidence`;
// readiness is computed by formula, never invented at runtime.
export const RELEASE_CHECKLIST = [
  {
    id: 'R1',
    label: 'Release-signing keystore configured',
    weight: 10,
    met: false,
    evidence: 'Debug-only builds; no release keystore present.',
  },
  {
    id: 'R2',
    label: 'Production API/service endpoint defined',
    weight: 10,
    met: false,
    evidence: 'Production server remains disabled / absent.',
  },
  {
    id: 'R3',
    label: 'Persian privacy policy document',
    weight: 10,
    met: false,
    evidence: 'No public privacy policy prepared.',
  },
  {
    id: 'R4',
    label: 'Cafe Bazaar developer account',
    weight: 10,
    met: false,
    evidence: 'Owner-gated; not created.',
  },
  {
    id: 'R5',
    label: 'Signed release APK build passes',
    weight: 10,
    met: false,
    evidence: 'Only debug APK built in CI.',
  },
  {
    id: 'R6',
    label: 'Listing assets + Persian screenshots',
    weight: 10,
    met: false,
    evidence: 'No store listing assets.',
  },
  {
    id: 'R7',
    label: 'All production/release flags stay disabled',
    weight: 10,
    met: true,
    evidence: 'Provider, OTP, splash, private-media and alpha-invite flags false on main.',
  },
  {
    id: 'R8',
    label: 'Consent + data-disclosure content',
    weight: 5,
    met: false,
    evidence: 'Consent v1 approved for cohort only.',
  },
  {
    id: 'R9',
    label: 'Content rating / age gate',
    weight: 5,
    met: false,
    evidence: 'Not prepared.',
  },
  {
    id: 'R10',
    label: 'Persian (fa) app description + localization',
    weight: 5,
    met: false,
    evidence: 'UI is fa but no store copy written.',
  },
  {
    id: 'R11',
    label: 'Permission justification list',
    weight: 5,
    met: false,
    evidence: 'Not prepared.',
  },
  {
    id: 'R12',
    label: 'Support / feedback channel',
    weight: 5,
    met: false,
    evidence: 'No public support channel published.',
  },
  {
    id: 'R13',
    label: 'Version bump + Persian release notes',
    weight: 5,
    met: false,
    evidence: 'No versioned release published.',
  },
];

// --- Storyboard progress (committed fallback; live STATUS.md overrides) -------
export const STORYBOARD = {
  currentStage: 24,
  stages: 30,
  note: 'Stage 24 — Beta and load testing.',
  path: 'docs/storyboard/STATUS.md',
};
