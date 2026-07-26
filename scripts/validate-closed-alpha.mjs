import { readFile } from 'node:fs/promises';

const configPath = new URL('../config/closed-alpha.json', import.meta.url);
const config = JSON.parse(await readFile(configPath, 'utf8'));

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

if (errors.length > 0) {
  throw new Error(`Closed-alpha configuration is unsafe:\n- ${errors.join('\n- ')}`);
}

console.log('Validated safe closed-alpha defaults.');
