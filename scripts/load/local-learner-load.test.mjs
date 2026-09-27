import assert from 'node:assert/strict';
import test from 'node:test';

import { runLocalLearnerLoad, selectProfile, validateLocalTarget } from './local-learner-load.mjs';

test('blocks a Preview URL before any load request can be sent', () => {
  assert.throws(
    () => validateLocalTarget('https://learnbox-r26dxexlj-learn-box.vercel.app'),
    /local loopback HTTP/,
  );
});

test('accepts only an explicit local loopback HTTP origin', () => {
  assert.equal(
    validateLocalTarget('http://127.0.0.1:3010/path?query=ignored'),
    'http://127.0.0.1:3010',
  );
  assert.throws(() => validateLocalTarget('http://192.168.1.2:3010'), /local loopback HTTP/);
  assert.throws(() => validateLocalTarget('http://localhost:3000'), /port 3010/);
});

test('selects the bounded baseline profile for synthetic traffic', () => {
  assert.deepEqual(selectProfile('baseline'), {
    clients: 25,
    requestsPerClient: 20,
    maxFailures: 5,
    maxFailureRate: 0.01,
    maxP95Ms: 1500,
    maxP99Ms: 2500,
  });
});

test('stops at the bounded failure limit without retaining a response body', async () => {
  let calls = 0;
  const result = await runLocalLearnerLoad({
    target: 'http://127.0.0.1:3010',
    profile: 'baseline',
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 503 };
    },
    now: () => calls * 10,
  });

  assert.equal(result.stopReason, 'failure_limit');
  assert.ok(result.failures >= 5);
  assert.ok(result.failures <= 29);
  assert.equal(result.passed, false);
  assert.equal('responseBodies' in result, false);
});

test('reports aggregate latency and passes a healthy smoke run', async () => {
  let tick = 0;
  const result = await runLocalLearnerLoad({
    target: 'http://localhost:3010',
    profile: 'smoke',
    fetchImpl: async () => ({ ok: true, status: 200 }),
    now: () => (tick += 10),
  });

  assert.equal(result.total, 100);
  assert.equal(result.failures, 0);
  assert.ok(result.latencyMs.p95 >= 0);
  assert.equal(result.passed, true);
  assert.equal(result.stopReason, null);
});

test('uses the profile client count as bounded concurrent synthetic traffic', async () => {
  let inFlight = 0;
  let peakInFlight = 0;
  const result = await runLocalLearnerLoad({
    target: 'http://127.0.0.1:3010',
    profile: 'smoke',
    fetchImpl: async () => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      inFlight -= 1;
      return { ok: true, status: 200 };
    },
  });

  assert.equal(result.passed, true);
  assert.equal(peakInFlight, 10);
});
