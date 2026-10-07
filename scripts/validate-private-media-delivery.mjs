import { readFile } from 'node:fs/promises';

const sessionSource = await readFile(
  new URL('../apps/website/lib/server-session.ts', import.meta.url),
  'utf8',
);
const learnerAuthSource = await readFile(
  new URL('../apps/website/lib/learner-auth.ts', import.meta.url),
  'utf8',
);
const developmentRoute = await readFile(
  new URL('../apps/website/app/api/development-session/route.ts', import.meta.url),
  'utf8',
);
const mediaRoute = await readFile(
  new URL('../apps/website/app/api/private-media/[contentId]/[kind]/route.ts', import.meta.url),
  'utf8',
);
const environmentExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const startMediaSource = await readFile(
  new URL('../apps/website/app/start-media.ts', import.meta.url),
  'utf8',
);
const learnerPageSource = await readFile(
  new URL('../apps/website/app/LearnerHome.tsx', import.meta.url),
  'utf8',
);
const learnerVisualSource = await readFile(
  new URL('../apps/website/app/components/StartMediaVisual.tsx', import.meta.url),
  'utf8',
);

for (const required of [
  'timingSafeEqual',
  'httpOnly: true',
  "sameSite: 'lax'",
  'LEARNBOX_SESSION_SECRET',
]) {
  if (!sessionSource.includes(required))
    throw new Error(`Server session safeguard missing: ${required}`);
}

for (const required of [
  "process.env.NODE_ENV !== 'development'",
  'LEARNBOX_ENABLE_DEVELOPMENT_SESSION',
]) {
  if (!developmentRoute.includes(required)) {
    throw new Error(`Development session guard missing: ${required}`);
  }
}

for (const required of [
  "LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED !== 'true'",
  'isStagingPrivateMediaEnvironment()',
  'start-a1-35-final-private-media-attestation.json',
  'authenticateLearner(request)',
  "access: 'private'",
  "'Cache-Control': 'private, no-store'",
  "'Cross-Origin-Resource-Policy': 'same-origin'",
]) {
  if (!mediaRoute.includes(required))
    throw new Error(`Private media delivery safeguard missing: ${required}`);
}

// The route must not verify the token itself. It must go through the single
// enforcement point, which is what applies revocation, account suspension and the
// production fail-closed policy. A route that called readLearnerSession directly would
// accept a signed-out session, so that call is forbidden here and required there.
if (mediaRoute.includes('readLearnerSession(')) {
  throw new Error('Private media route must use authenticateLearner, not readLearnerSession.');
}
for (const required of [
  'readLearnerSession(request)',
  // Renamed from isSessionRevoked in M3.1: the same single query now also refuses a
  // suspended account, so the safeguard follows the broader contract.
  'isSessionBlocked(',
  "process.env.NODE_ENV === 'production'",
]) {
  if (!learnerAuthSource.includes(required))
    throw new Error(`Learner auth enforcement safeguard missing: ${required}`);
}

if (mediaRoute.includes('.private.blob.vercel-storage.com')) {
  throw new Error('Private media delivery must not hard-code a Blob URL.');
}

for (const disabledDefault of [
  'NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED=false',
  'LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED=false',
]) {
  if (!environmentExample.includes(disabledDefault)) {
    throw new Error(`Private media disabled default missing: ${disabledDefault}`);
  }
}

// Route-mapping safeguards are asserted on whitespace-normalised source so that
// Prettier reflowing a conditional cannot silently disable a security check.
const normalisedStartMedia = startMediaSource.replace(/\s+/g, ' ');

for (const required of [
  "privateMediaFlag === 'true' && authMode === 'server-otp'",
  // A private session must resolve to the authenticated private-media route,
  // and anything that is not a private session must never borrow that route.
  "mode === 'private-session' ? 'private-media'",
  "'local-preview-media'",
  '`/api/${route}/${contentId}`',
  'image: `${basePath}/image`',
  'wordAudio: `${basePath}/word-audio`',
  'sentenceAudio: `${basePath}/sentence-audio`',
]) {
  if (!normalisedStartMedia.includes(required.replace(/\s+/g, ' '))) {
    throw new Error(`Private media client safeguard missing: ${required}`);
  }
}

// Every route this module can emit must be an authenticated or local-only route:
// a new mode must never be able to point media at a public or third-party origin.
// Only the `route` assignment is inspected, so StartMediaMode names (e.g.
// 'server-media') are not mistaken for route values.
const allowedMediaRoutes = new Set(['private-media', 'content-media', 'local-preview-media']);
const routeAssignment = /const route = (.*?);/.exec(normalisedStartMedia);
if (!routeAssignment) {
  throw new Error('Could not locate the media route assignment in start-media.ts');
}
const emittedRoutes = [...routeAssignment[1].matchAll(/(?<![=!]==\s)'([a-z-]+)'/g)]
  .map((m) => m[1])
  .filter((candidate) => candidate.endsWith('media'));
for (const route of emittedRoutes) {
  if (!allowedMediaRoutes.has(route)) {
    throw new Error(`Unexpected media route in start-media.ts: ${route}`);
  }
}

for (const required of [
  'process.env.NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED',
  'authMode',
  'buildStartMediaSources(currentItem.id, startMediaMode)',
]) {
  if (!learnerPageSource.includes(required)) {
    throw new Error(`Learner private media attachment missing: ${required}`);
  }
}

const learnerSources = `${startMediaSource}\n${learnerPageSource}\n${learnerVisualSource}`;
if (/https?:\/\/|blob\.vercel-storage\.com/.test(learnerSources)) {
  throw new Error('Learner media code must use same-origin relative routes only.');
}

if (
  mediaRoute.includes('NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED') ||
  startMediaSource.includes('LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED')
) {
  throw new Error('Client selection and server delivery flags must remain independent.');
}

console.info(
  'Private media delivery remains session-guarded, same-origin and independently release-flagged.',
);
