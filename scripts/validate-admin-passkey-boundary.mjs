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

// NEXT_PUBLIC_* values are inlined into the client bundle by Next at build time, so Production's
// public Admin authentication surfaces must come from the exact commit rather than operator shell
// state. Defaults stay off elsewhere; the release matrix is the one reviewed place that enables
// Passkey and phone OTP, and the builder verifies both from the resulting artifact.
const productionBuildSource = await readFile(
  new URL('../infrastructure/production/admin/build-admin-image.sh', import.meta.url),
  'utf8',
);
const productionReleaseSource = await readFile(
  new URL('../infrastructure/production/admin/release-build.env', import.meta.url),
  'utf8',
);

for (const required of [
  'NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=true',
  'NEXT_PUBLIC_LEARNBOX_ADMIN_OTP_UI_ENABLED=true',
]) {
  if (!productionReleaseSource.includes(required)) {
    throw new Error(
      `Production Admin release matrix must enable both sign-in methods: ${required}`,
    );
  }
}

for (const forbidden of [
  'NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED:-false',
  'NEXT_PUBLIC_LEARNBOX_ADMIN_OTP_UI_ENABLED:-false',
]) {
  if (productionBuildSource.includes(forbidden)) {
    throw new Error(
      `Production Admin builds must not default a sign-in method to false: ${forbidden}`,
    );
  }
}

for (const required of [
  'ADMIN_RELEASE_CONFIG="infrastructure/production/admin/release-build.env"',
  'git show "$SOURCE_SHA:$ADMIN_RELEASE_CONFIG"',
  'unset NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED NEXT_PUBLIC_LEARNBOX_ADMIN_OTP_UI_ENABLED',
  'PASSKEY_UI="${NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED:-}"',
  'OTP_UI="${NEXT_PUBLIC_LEARNBOX_ADMIN_OTP_UI_ENABLED:-}"',
  'if [ "$PASSKEY_UI" != true ] || [ "$OTP_UI" != true ]; then',
  '.next/server/app/index.html',
  "rendered_has 'server-passkey'",
  "rendered_has 'local-prototype'",
  "rendered_has 'ورود با شماره موبایل'",
]) {
  if (!productionBuildSource.includes(required)) {
    throw new Error(
      `Production Admin build must enforce and prove Passkey plus phone OTP authentication: ${required}`,
    );
  }
}

console.info('Admin passkey boundary is disabled by default and ready for an approved activation.');
