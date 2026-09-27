import { readFile } from 'node:fs/promises';

const environmentSource = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const runtimeSource = await readFile(
  new URL('../apps/website/lib/alpha-runtime.ts', import.meta.url),
  'utf8',
);
const handlerSource = await readFile(
  new URL('../apps/website/lib/alpha-http.ts', import.meta.url),
  'utf8',
);
const routeSource = await readFile(
  new URL('../apps/website/app/api/auth/invite/check/route.ts', import.meta.url),
  'utf8',
);
const policySource = await readFile(
  new URL('../apps/api/src/alpha/invite-policy.ts', import.meta.url),
  'utf8',
);
const gateSource = await readFile(
  new URL('../apps/website/app/components/InviteGate.tsx', import.meta.url),
  'utf8',
);
const learnerHomeSource = await readFile(
  new URL('../apps/website/app/LearnerHome.tsx', import.meta.url),
  'utf8',
);
const ownerIssuerSource = await readFile(
  new URL('../apps/api/src/alpha/owner-invite-issuer.ts', import.meta.url),
  'utf8',
);
const ownerIssuerRouteSource = await readFile(
  new URL('../apps/website/app/api/owner/alpha-invite/route.ts', import.meta.url),
  'utf8',
);
const closedAlphaSource = await readFile(
  new URL('../config/closed-alpha.json', import.meta.url),
  'utf8',
);
const closedAlphaConfig = JSON.parse(closedAlphaSource);

const errors = [];

for (const required of [
  'NEXT_PUBLIC_LEARNBOX_ALPHA_INVITE_UI_ENABLED=false',
  'LEARNBOX_ALPHA_INVITE_ENABLED=false',
  'LEARNBOX_OWNER_ALPHA_INVITE_ISSUER_ENABLED=false',
]) {
  if (!environmentSource.includes(required)) {
    errors.push(`Invite boundary default flag missing: ${required}`);
  }
}

if (!runtimeSource.includes("environment.LEARNBOX_ALPHA_INVITE_ENABLED !== 'true'")) {
  errors.push('Invite runtime must fail closed unless the server flag is exactly true.');
}
if (!runtimeSource.includes('LEARNBOX_ALPHA_INVITE_SECRET')) {
  errors.push('Invite runtime must require a server invite secret.');
}
if (!runtimeSource.includes('LEARNBOX_ALPHA_CONSENT_VERSION')) {
  errors.push('Invite runtime must resolve the consent version from the environment or config.');
}

if (!routeSource.includes('inviteHttpDependenciesFromEnvironment()')) {
  errors.push('Invite route must resolve dependencies from the environment factory.');
}
if (!routeSource.includes('404')) {
  errors.push('Invite route must respond 404 when the boundary is disabled.');
}

for (const required of [
  'isTrustedJsonPost',
  'invite_invalid',
  'invite_limited',
  'invite_unavailable',
]) {
  if (!handlerSource.includes(required)) {
    errors.push(`Invite handler requirement missing: ${required}`);
  }
}
if (!handlerSource.includes('status: 204')) {
  errors.push('Invite handler must accept with an empty 204 response.');
}

if (!policySource.includes('createHmac') || !policySource.includes('secret.length < 32')) {
  errors.push('Invite code hashing must use a keyed HMAC with a server secret.');
}
if (!ownerIssuerSource.includes("LEARNBOX_OWNER_ALPHA_INVITE_ISSUER_ENABLED !== 'true'")) {
  errors.push('Owner invite issuer must fail closed unless its exact server flag is true.');
}
if (!ownerIssuerSource.includes("environment.VERCEL_ENV === 'preview'")) {
  errors.push('Owner invite issuer must be restricted to Preview.');
}
if (!ownerIssuerSource.includes('hashInviteCode') || !ownerIssuerSource.includes('max_uses')) {
  errors.push('Owner invite issuer must persist only a keyed hash and a bounded use count.');
}
if (
  !ownerIssuerRouteSource.includes('isOwnerInviteIssuerEnabled(process.env)') ||
  !ownerIssuerRouteSource.includes('handleOwnerInviteIssue') ||
  !ownerIssuerRouteSource.includes('404')
) {
  errors.push('Owner invite issue route must be gated, same-origin handled and fail closed.');
}

const consentWording =
  'LearnBox در مرحلهٔ آزمایشی محدود است. ممکن است خطا یا تغییر در تجربه ببینی. لطفاً فقط اطلاعاتی را وارد کن که برای آزمایش لازم است؛ برای گزارش مشکل می‌توانی از راه ارتباطی اعلام‌شده استفاده کنی. می‌توانی درخواست حذف دادهٔ آزمایشی‌ات را بدهی.';
if (!gateSource.includes(consentWording)) {
  errors.push('Invite gate must show the approved closed-alpha consent wording.');
}
if (!gateSource.includes("fetch('/api/auth/invite/check'")) {
  errors.push('Invite gate must call the same-origin invite check route.');
}
if (!gateSource.includes('onInviteAccepted')) {
  errors.push('Invite gate must accept only through the acknowledged action.');
}
if (gateSource.match(/localStorage|sessionStorage|console\./)) {
  errors.push('Invite gate must not persist or log invite state or codes.');
}
if (gateSource.match(/checkbox|type="checkbox"/i)) {
  errors.push('Invite gate must not use a consent checkbox.');
}

const inviteReturnIndex = learnerHomeSource.indexOf('if (!inviteAccepted)');
const authReturnIndex = learnerHomeSource.indexOf('if (!authenticated)');
if (inviteReturnIndex < 0 || authReturnIndex < 0 || inviteReturnIndex > authReturnIndex) {
  errors.push('Learner home must gate invite acceptance before authentication.');
}
if (!learnerHomeSource.includes('resolveInviteGateMode')) {
  errors.push('Learner home must resolve the invite gate mode from the flag.');
}

if (closedAlphaConfig.enabled !== false) {
  errors.push('Closed alpha must remain disabled by default.');
}
if (
  typeof closedAlphaConfig.consent?.version !== 'string' ||
  closedAlphaConfig.consent.version.trim() === ''
) {
  errors.push('Closed alpha must carry a versioned consent wording.');
}
if (
  !Number.isInteger(closedAlphaConfig.inviteCodeMaxUses) ||
  closedAlphaConfig.inviteCodeMaxUses < 1 ||
  closedAlphaConfig.inviteCodeMaxUses > 20
) {
  errors.push('inviteCodeMaxUses must be an integer between 1 and 20.');
}
if (
  Array.isArray(closedAlphaConfig.invitationCodes) ||
  Array.isArray(closedAlphaConfig.inviteCodes)
) {
  errors.push('Plaintext invite codes must never be committed to configuration.');
}

if (errors.length > 0) {
  throw new Error(`Invite boundary is unsafe:\n- ${errors.join('\n- ')}`);
}

console.log('Validated safe invite boundary defaults.');
