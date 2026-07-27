import { readFile } from 'node:fs/promises';

const raw = await readFile(new URL('../config/product-experience.json', import.meta.url), 'utf8');
const config = JSON.parse(raw);
const fail = (message) => {
  throw new Error(`Invalid product experience config: ${message}`);
};

if (config.schemaVersion !== 1) fail('unsupported schema version');
const start = config.tiers?.learnbox_start;
const plus = config.tiers?.learnbox_plus;
if (!start || !plus) fail('both stable tiers are required');
if (!start.permanent) fail('Start must be permanent');
if (!start.reviewAccess?.dueReviewsUnlimited || !start.reviewAccess?.learnedContentRetained) {
  fail('Start must retain unlimited due reviews and learned content');
}
const daily = start.recommendedNewWordsPerDay;
if (
  !daily ||
  daily.minimum !== 10 ||
  daily.maximum !== 15 ||
  daily.default < 10 ||
  daily.default > 15
) {
  fail('daily recommendation must stay within 10 to 15');
}
if (
  !Array.isArray(plus.subscriptionPeriods) ||
  plus.subscriptionPeriods.join(',') !== 'monthly,three_month,annual'
) {
  fail('Plus subscription periods are missing or unstable');
}
const paywall = config.paywall;
if (!paywall || paywall.firstSeriousOfferNotBeforeActiveDays < 3) {
  fail('serious paywall cannot be eligible before three active days');
}
if (!paywall.supportiveCopy?.trim()) fail('supportive copy is required');
const forbidden = new Set(paywall.forbiddenTactics);
for (const tactic of ['fear', 'guilt', 'countdown', 'streak_threat', 'false_scarcity']) {
  if (!forbidden.has(tactic)) fail(`missing forbidden tactic: ${tactic}`);
}

console.log('Product experience config is valid.');
