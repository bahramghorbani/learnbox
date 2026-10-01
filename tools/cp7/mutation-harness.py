#!/usr/bin/env python3
"""LB-B35 CP7 mutation harness (evidence tooling, not part of the product build).

Applies one deliberate defect at a time to a source file, runs the named vitest file, and reports whether the
suite KILLED the mutant (some test failed) or it SURVIVED. The original file is restored after every run and at
exit. Run from the repo root:  python3 tools/cp7/mutation-harness.py
A SKIP means the mutation pattern no longer matches the source and must be updated; it is never a pass.
"""
import atexit
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / 'packages/learning-engine'
API = ROOT / 'apps/api'

SV2 = ENGINE / 'src/scheduler-v2.ts'
SVC = API / 'src/reviews/mobile-review-batch.service.ts'
PRE = API / 'src/reviews/scheduler-v2-preflight.ts'
WEBC = ROOT / 'apps/website/lib/learner-review-web-client.ts'
WEBS = ROOT / 'apps/website/lib/learner-review-web-sync.ts'
WEBH = ROOT / 'apps/website/lib/learner-review-web-http.ts'

ENGINE_TEST = ('packages/learning-engine', 'test/cp7-scheduler-v2.test.ts', None)
API_TEST = ('apps/api', 'test/cp7-scheduler-v2-service.test.ts', 'tsc')
# The website compiles against apps/api/dist, so a service mutation must be rebuilt before the
# web-boundary suite can observe it.
WEB_TEST = (
    'apps/website',
    'test/learner-review-web-http.test.ts test/learner-review-web-client.test.ts '
    'test/learner-review-web-sync.test.ts',
    'build-api',
)

# (file, label, find, replace, which test)
MUTANTS = [
    (SV2, 'ENG-CLAMP regression: Unknown not clamped into Box b-1',
     'return Math.min(placed, upperEdge(target) - V2_EDGE_MARGIN_DAYS);', 'return placed;', ENGINE_TEST),
    (SV2, 'Unknown floor removed (can drop 2 Boxes)',
     'const placed = Math.max(stability * V2_UNKNOWN_FACTOR, lowerEdge(target));',
     'const placed = stability * V2_UNKNOWN_FACTOR;', ENGINE_TEST),
    (SV2, 'Box-1 graduation removed (Known can stall in Box 1)',
     'if (box === 1) candidate = Math.max(candidate, V2_GRADUATION_DAYS);', '/* removed */', ENGINE_TEST),
    (SV2, 'Known factor 1.8 -> 1.5', 'export const V2_KNOWN_FACTOR = 1.8;',
     'export const V2_KNOWN_FACTOR = 1.5;', ENGINE_TEST),
    (SV2, 'Known factor 1.8 -> 3 (clamp is then the only guard)', 'export const V2_KNOWN_FACTOR = 1.8;',
     'export const V2_KNOWN_FACTOR = 3;', ENGINE_TEST),
    (SV2, 'Box-5 cap 180 -> 365', 'export const V2_BOX5_CAP_DAYS = 180;',
     'export const V2_BOX5_CAP_DAYS = 365;', ENGINE_TEST),
    (SV2, 'Box-5 growth x3 -> x2', 'export const V2_BOX5_FACTOR = 3;', 'export const V2_BOX5_FACTOR = 2;',
     ENGINE_TEST),
    (SV2, 'edge margin 1e-9 -> 0 (lands ON the edge)', 'export const V2_EDGE_MARGIN_DAYS = 1e-9;',
     'export const V2_EDGE_MARGIN_DAYS = 0;', ENGINE_TEST),
    (SV2, 'runtime assertion disabled', '  assertBoxTransition({\n    before,\n    response,\n    after,',
     '  if (false) assertBoxTransition({\n    before,\n    response,\n    after,', ENGINE_TEST),
    (SV2, "legacy 'hard' no longer projects to known",
     'const response = answer.response ?? toBinaryResponse(answer.grade);',
     "const response = answer.response ?? (answer.grade === 'hard' ? 'unknown' : toBinaryResponse(answer.grade));",
     ENGINE_TEST),
    (SV2, 'compat state influences scheduling (relearning cards frozen)',
     '  const before = boxFromStabilityDays(stability);\n  const proposed',
     "  if (schedule.state === 'relearning') return { ...schedule, dueAt: new Date(now.getTime() + 1e6) };\n  const before = boxFromStabilityDays(stability);\n  const proposed",
     ENGINE_TEST),
    (SV2, 'lateness becomes an input', '  const dueAt = new Date(now.getTime() + Math.max(',
     '  const lateMs = Math.max(0, now.getTime() - schedule.dueAt.getTime());\n  const dueAt = new Date(lateMs / 10 + now.getTime() + Math.max(',
     ENGINE_TEST),
    (SV2, 'compat state: new + Unknown -> relearning', "if (previous === 'new') return 'learning';",
     "if (previous === 'new') return response === 'unknown' ? 'relearning' : 'learning';", ENGINE_TEST),
    (SV2, 'compat state: Box-5 Known not mastered', "return nextBox === 5 ? 'mastered' : 'review';",
     "return 'review';", ENGINE_TEST),
    (SV2, 'invalid stored stability accepted', 'if (!Number.isFinite(stability) || stability <= 0) {',
     'if (false) {', ENGINE_TEST),
    (SV2, 'non-finite proposal accepted by the gate',
     'if (!Number.isFinite(proposedStabilityDays) || proposedStabilityDays <= 0) {', 'if (false) {', ENGINE_TEST),
    (SV2, 'Unknown in Box 1 leaves Box 1',
     'if (box === 1) return Math.max(stability * V2_UNKNOWN_FACTOR, V2_MIN_STABILITY_DAYS);',
     'if (box === 1) return Math.max(stability * V2_UNKNOWN_FACTOR, 1.5);', ENGINE_TEST),
    (SVC, 'flag off still uses the V2 path', 'const useV2 = this.options.schedulerV2 === true;',
     'const useV2 = true;', API_TEST),
    (SVC, 'preflight skipped', 'if (this.options.schedulerV2) await this.options.schedulerV2Preflight!();',
     '/* skipped */', API_TEST),
    (SVC, 'engine stamp dropped under V2',
     '...(useV2 ? { engineVersion: SCHEDULER_V2_ENGINE_VERSION } : {}),', '...{},', API_TEST),
    (SVC, 'engine stamp leaks when flag off',
     '...(useV2 ? { engineVersion: SCHEDULER_V2_ENGINE_VERSION } : {}),',
     'engineVersion: SCHEDULER_V2_ENGINE_VERSION,', API_TEST),
    (SVC, 'V2 constructible without a preflight',
     'if (options.schedulerV2 && !options.schedulerV2Preflight) {', 'if (false) {', API_TEST),
    (PRE, 'preflight tolerates a missing column',
     "if (!byName.has('engine_version')) problems.push('review_events.engine_version is missing');\n  else if",
     "if (false) problems.push('x');\n  else if", API_TEST),
    (PRE, 'preflight tolerates a wrong column type', "if (byName.get('engine_version') !== 'smallint')",
     'if (false)', API_TEST),
    (PRE, 'preflight skips the constraint check', "if (byName.has('engine_version')) {\n    // The CHECK",
     "if (false) {\n    // The CHECK", API_TEST),
    (PRE, 'a failed preflight is cached forever', 'if (verified === attempt) verified = null;', '/* keep */',
     API_TEST),
    (PRE, "flag accepts 'TRUE'/'1'", "return environment.LEARNBOX_SCHEDULER_V2 === 'true';",
     "return /^(true|1)$/i.test(environment.LEARNBOX_SCHEDULER_V2 ?? '');", API_TEST),
    # --- LB-B35 CP7 failure-semantics fix (deterministic vs transient) ---
    (SVC, 'FLATTEN REGRESSION: deterministic errors collapse back to serverUnavailable',
     "const code: MobileReviewBatchErrorCode = deterministic\n        ? 'schedulerRejected'\n        : 'serverUnavailable';",
     "const code: MobileReviewBatchErrorCode = 'serverUnavailable';", API_TEST),
    (SVC, 'cause discarded (operator loses the diagnostic)',
     '        { cause: error },', '        {},', API_TEST),
    (SVC, 'schedulerRejected wrongly marked retryable',
     "  'schedulerRejected',\n];", '];', API_TEST),
    (SVC, 'invariant violations no longer classified as deterministic',
     "        (error.name === 'SchedulerV2PreflightError' || error.name === 'SchedulerInvariantError');",
     "        error.name === 'SchedulerV2PreflightError';", API_TEST),
    (SVC, 'client message leaks the operator diagnostic',
     "          ? 'Review batch refused: the server scheduler configuration is not usable.'",
     '          ? `Review batch refused: ${String(error)}`', API_TEST),
    (WEBH, 'HTTP boundary returns a retryable 503 for a deterministic refusal',
     "      return error('schedulerRejected', 422);", "      return error('serverUnavailable', 503);", WEB_TEST),
    (WEBC, 'client maps the deterministic 422 back to the retryable unavailable',
     "  if (response.status === 422) return { status: 'rejected' };", '  /* removed */', WEB_TEST),
    (WEBS, 'sync retries a deterministic rejection (the original infinite-retry defect)',
     "      result.status === 'rejected'\n        ? currentQueue()\n        : currentQueue().map((event) =>",
     '      false\n        ? currentQueue()\n        : currentQueue().map((event) =>', WEB_TEST),
]

originals = {}
for f in {m[0] for m in MUTANTS}:
    originals[f] = f.read_text()


def restore():
    for f, text in originals.items():
        f.write_text(text)


atexit.register(restore)


def run(test):
    cwd, spec, pre = test
    cmd = f'cd {ROOT / cwd} && '
    if pre == 'tsc':
        cmd += 'pnpm -s exec tsc -p . --noEmit >/dev/null 2>&1; '
    if pre == 'build-api':
        cmd = f'cd {ROOT / "apps/api"} && pnpm -s build >/dev/null 2>&1; ' + cmd
    cmd += f'./node_modules/.bin/vitest run {spec}'
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    out = r.stdout + r.stderr
    m = re.search(r'Tests\s+(\d+) failed', out)
    if m:
        return f'KILLED ({m.group(1)} tests fail)'
    return 'KILLED (compile/other)' if r.returncode != 0 else 'SURVIVED'


bad = 0
for f, label, find, repl, test in MUTANTS:
    if find not in originals[f]:
        print(f'{"SKIP (pattern missing)":28} {label}')
        bad += 1
        continue
    f.write_text(originals[f].replace(find, repl, 1))
    verdict = run(test)
    f.write_text(originals[f])
    print(f'{verdict:28} {label}')
    bad += verdict.startswith('SURVIVED')
restore()
print(f'mutants: {len(MUTANTS)}  survivors/skips: {bad}')
sys.exit(1 if bad else 0)
