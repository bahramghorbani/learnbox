import { readFile } from 'node:fs/promises';

const configPath = new URL('../config/closed-alpha.json', import.meta.url);
const config = JSON.parse(await readFile(configPath, 'utf8'));
const adminPreview = await readFile(
  new URL('../apps/admin/app/components/ContentReviewWorkspace.tsx', import.meta.url),
  'utf8',
);

const requiredApprovals = ['participant-list', 'invitation-channel', 'consent-wording'];
const errors = [];

if (config.enabled !== false) errors.push('Closed alpha must be disabled by default.');
if (!Number.isInteger(config.maximumParticipants) || config.maximumParticipants < 1) {
  errors.push('maximumParticipants must be a positive integer.');
}
if (config.maximumParticipants > 20) {
  errors.push('Closed alpha may not exceed 20 participants without a reviewed plan.');
}
if (config.invitationMode !== 'allowlist') {
  errors.push('Closed alpha invitations must use an allowlist.');
}
if (config.telemetry !== 'minimal') errors.push('Closed alpha telemetry must remain minimal.');
for (const service of ['billing', 'notifications', 'realSms']) {
  if (config.services?.[service] !== false) {
    errors.push(`Closed alpha ${service} must be disabled by default.`);
  }
}
for (const approval of requiredApprovals) {
  if (!config.requiredApprovals?.includes(approval)) {
    errors.push(`Missing required owner approval: ${approval}.`);
  }
}
if (typeof config.consent?.version !== 'string' || config.consent.version.trim() === '') {
  errors.push('Consent wording must be versioned.');
}
if (
  !Number.isInteger(config.inviteCodeMaxUses) ||
  config.inviteCodeMaxUses < 1 ||
  config.inviteCodeMaxUses > 20
) {
  errors.push('inviteCodeMaxUses must be an integer between 1 and 20.');
}
if (Array.isArray(config.invitationCodes) || Array.isArray(config.inviteCodes)) {
  errors.push('Plaintext invite codes must never be committed to configuration.');
}
// LB-B30: the former bundled local-preview UI was removed (it shipped card content in the client
// bundle). The invariants this gate protects are unchanged: Admin must never imply real
// publication, never imply an authenticated session it does not have, and never show a fictional
// editor identity. They are now asserted against the server-backed workspace.
if (
  !adminPreview.includes('انتشار همچنان غیرفعال') ||
  !adminPreview.includes('data-publication="disabled"')
) {
  errors.push('Admin review must disclose that publication remains disabled.');
}
if (!adminPreview.includes('ورود امن فعال') || !adminPreview.includes('بدون ورود')) {
  errors.push('Admin review must distinguish an authenticated server session from no sign-in.');
}
if (!adminPreview.includes('برای مشاهدهٔ محتوای بازبینی باید با ورود امن وارد شوید')) {
  errors.push('Admin review must require a secure sign-in before showing any review content.');
}
if (
  /from\s+['"][^'"]*(content-models|\.\.\/lib\/(fixtures|drafts)|drafts?\/|manifest)[^'"]*['"]/.test(
    adminPreview.replace(/import type[^\n]*\n/g, ''),
  )
) {
  errors.push(
    'Admin review must not import repository card content or manifests into the client bundle.',
  );
}
if (adminPreview.includes('مریم رضایی')) {
  errors.push('Admin preview must not show a fictional authenticated editor identity.');
}

if (errors.length > 0) {
  throw new Error(`Closed-alpha configuration is unsafe:\n- ${errors.join('\n- ')}`);
}

console.log('Validated safe closed-alpha defaults.');
