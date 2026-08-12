const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);

const PROFILES = {
  smoke: {
    clients: 10,
    requestsPerClient: 10,
    maxFailures: 0,
    maxFailureRate: 0,
    maxP95Ms: 1000,
    maxP99Ms: 1500,
  },
  baseline: {
    clients: 25,
    requestsPerClient: 20,
    maxFailures: 5,
    maxFailureRate: 0.01,
    maxP95Ms: 1500,
    maxP99Ms: 2500,
  },
};

const ALLOWED_PATHS = ['/', '/manifest.webmanifest', '/offline', '/icon.svg'];

export function validateLocalTarget(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Load target must be a local loopback HTTP URL.');
  }

  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('Load target must be a local loopback HTTP URL.');
  }

  if (url.port !== '3010') {
    throw new Error('Load target must use local port 3010.');
  }

  return url.origin;
}

export function selectProfile(value) {
  const profile = PROFILES[value];
  if (!profile) throw new Error('Load profile must be smoke or baseline.');
  return { ...profile };
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(ratio * sorted.length) - 1];
}

export async function runLocalLearnerLoad({ target, profile, fetchImpl = fetch, now = Date.now }) {
  const origin = validateLocalTarget(target);
  const limits = typeof profile === 'string' ? selectProfile(profile) : profile;
  const totalRequested = limits.clients * limits.requestsPerClient;
  const latencies = [];
  let failures = 0;
  let total = 0;
  let stopReason = null;

  let nextIndex = 0;

  async function runClient() {
    while (nextIndex < totalRequested && stopReason === null) {
      const index = nextIndex;
      nextIndex += 1;
      const path = ALLOWED_PATHS[index % ALLOWED_PATHS.length];
      const startedAt = now();
      try {
        const response = await fetchImpl(`${origin}${path}`, { redirect: 'error' });
        latencies.push(Math.max(0, now() - startedAt));
        total += 1;
        if (!response.ok) failures += 1;
      } catch {
        latencies.push(Math.max(0, now() - startedAt));
        total += 1;
        failures += 1;
      }

      if (
        (limits.maxFailures === 0 && failures > 0) ||
        (limits.maxFailures > 0 && failures >= limits.maxFailures)
      ) {
        stopReason = 'failure_limit';
      }
    }
  }

  await Promise.all(Array.from({ length: limits.clients }, runClient));

  const failureRate = total === 0 ? 1 : failures / total;
  const latencyMs = {
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
  };
  const passed =
    failures <= limits.maxFailures &&
    failureRate <= limits.maxFailureRate &&
    latencyMs.p95 <= limits.maxP95Ms &&
    latencyMs.p99 <= limits.maxP99Ms &&
    stopReason === null;

  return {
    profile:
      Object.entries(PROFILES).find(([, value]) => value.clients === limits.clients)?.[0] ??
      'custom',
    target: origin,
    total,
    failures,
    failureRate,
    latencyMs,
    passed,
    stopReason,
  };
}

function readCliOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function main() {
  const profile = readCliOption('--profile', 'smoke');
  const target = process.env.LEARNBOX_LOAD_TARGET ?? 'http://127.0.0.1:3010';
  const result = await runLocalLearnerLoad({ target, profile });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    process.stderr.write(
      `local_load_failed: ${error instanceof Error ? error.message : 'unknown'}\n`,
    );
    process.exitCode = 1;
  });
}
