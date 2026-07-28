import { readFile } from 'node:fs/promises';

const adapter = await readFile(
  new URL('../apps/website/app/product-experience.ts', import.meta.url),
  'utf8',
);
const fail = (message) => {
  throw new Error(`Invalid client tier adapter: ${message}`);
};

for (const requiredFragment of [
  "from '@learnbox/billing-core'",
  'resolveLearnBoxTierAccess',
  'resolveClientTierExperience',
  "access.tierId === 'learnbox_plus'",
  'startTierExperience.recommendedNewWordsPerDay',
  'startTierExperience.personalWordLimit',
  'new Set<string>()',
]) {
  if (!adapter.includes(requiredFragment)) fail(`missing ${requiredFragment}`);
}

for (const forbiddenFragment of ['BillingProduct', 'VerifiedPurchase', 'providerPurchaseId']) {
  if (adapter.includes(forbiddenFragment)) {
    fail(`payment verification detail must not be added: ${forbiddenFragment}`);
  }
}

console.log('Client tier adapter is valid.');
