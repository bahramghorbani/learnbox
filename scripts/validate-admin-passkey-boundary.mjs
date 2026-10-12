import { readFile } from 'node:fs/promises';

const routeSource = await readFile(
  new URL('../apps/admin/lib/server/admin-auth-routes.ts', import.meta.url),
  'utf8',
);
const policySource = await readFile(
  new URL('../apps/admin/lib/server/admin-auth-policy.ts', import.meta.url),
  'utf8',
);
const sessionSource = await readFile(
  new URL('../apps/admin/lib/server/admin-session.ts', import.meta.url),
  'utf8',
);
const uiSource = await readFile(
  new URL('../apps/admin/app/components/PasskeySignIn.tsx', import.meta.url),
  'utf8',
);
const gateSource = await readFile(
  new URL('../apps/admin/app/components/AdminAuthGate.tsx', import.meta.url),
  'utf8',
);
const environmentSource = await readFile(new URL('../.env.example', import.meta.url), 'utf8');

for (const required of [
  'HttpOnly; Secure; SameSite=Strict',
  '__Host-learnbox_admin_ceremony',
  "assertTrustedAdminMutation(request, config, ['application/json'])",
  'return notFound()',
]) {
  if (!routeSource.includes(required)) {
    throw new Error(`Admin passkey route requirement missing: ${required}`);
  }
}

if (routeSource.match(/localStorage|sessionStorage|console\./)) {
  throw new Error('Admin passkey routes must not persist or log authentication material.');
}

if (routeSource.match(/fallback.{0,40}local|local.{0,40}fallback/i)) {
  throw new Error('Admin passkey routes must not fall back to a local prototype.');
}

for (const required of [
  "environment.LEARNBOX_ADMIN_PASSKEY_ENABLED !== 'true'",
  'environment.LEARNBOX_ADMIN_ORIGIN',
  'environment.LEARNBOX_ADMIN_RP_ID',
  'environment.LEARNBOX_ADMIN_TOKEN_HASH_KEY',
]) {
  if (!policySource.includes(required)) {
    throw new Error(`Admin passkey policy requirement missing: ${required}`);
  }
}

for (const required of ['hashAdminSecret', 'createAdminSessionSecrets', 'evaluateAdminSession']) {
  if (!sessionSource.includes(required)) {
    throw new Error(`Admin passkey session requirement missing: ${required}`);
  }
}

for (const required of [
  "'/api/auth/login/options'",
  "'/api/auth/login/verify'",
  'startAuthentication',
]) {
  if (!uiSource.includes(required)) {
    throw new Error(`Admin passkey sign-in UI requirement missing: ${required}`);
  }
}

if (uiSource.match(/localStorage|sessionStorage|console\./)) {
  throw new Error('Admin passkey sign-in must not persist credentials or tokens in the browser.');
}

for (const required of ["mode === 'local-prototype'", "'/api/auth/session'"]) {
  if (!gateSource.includes(required)) {
    throw new Error(`Admin auth gate requirement missing: ${required}`);
  }
}

if (gateSource.match(/localStorage|sessionStorage|console\./)) {
  throw new Error('Admin auth gate must not persist authentication state in the browser.');
}

for (const required of [
  'LEARNBOX_ADMIN_PASSKEY_ENABLED=false',
  'NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=false',
  'LEARNBOX_ADMIN_BOOTSTRAP_ENABLED=false',
]) {
  if (!environmentSource.includes(required)) {
    throw new Error(`Admin passkey default flag missing: ${required}`);
  }
}

// NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED is inlined into the client bundle by Next at build
// time, so it is the only Admin auth control that a deployment cannot set, correct or override. An
// image built without it resolves to 'local-prototype', and the gate above then short-circuits to
// signed-in: the workspace renders with no passkey prompt and no session call. Defaults-off is the
// right posture everywhere else, which is exactly why the production build must be the one place
// that refuses it — and must confirm the result from the built artifact instead of trusting the
// argument it just passed, since a cache hit or a silent Dockerfile default would otherwise pass.
const productionBuildSource = await readFile(
  new URL('../infrastructure/production/admin/build-admin-image.sh', import.meta.url),
  'utf8',
);

if (productionBuildSource.includes('NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED:-false')) {
  throw new Error(
    'Production Admin builds must not default the Passkey UI flag to false: one forgotten variable would ship local-prototype authentication.',
  );
}

for (const required of [
  'PASSKEY_UI="${NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED:-}"',
  'if [ "$PASSKEY_UI" != "true" ]; then',
  '.next/server/app/index.html',
  "rendered_has 'server-passkey'",
  "rendered_has 'local-prototype'",
]) {
  if (!productionBuildSource.includes(required)) {
    throw new Error(
      `Production Admin build must enforce and prove server-passkey authentication: ${required}`,
    );
  }
}

console.info('Admin passkey boundary is disabled by default and ready for an approved activation.');
