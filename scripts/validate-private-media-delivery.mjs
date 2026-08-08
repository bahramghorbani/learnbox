import { readFile } from 'node:fs/promises';

const sessionSource = await readFile(
  new URL('../apps/website/lib/server-session.ts', import.meta.url),
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
  'readLearnerSession(request)',
  "access: 'private'",
  "'Cache-Control': 'private, no-store'",
  "'Cross-Origin-Resource-Policy': 'same-origin'",
]) {
  if (!mediaRoute.includes(required))
    throw new Error(`Private media delivery safeguard missing: ${required}`);
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

for (const required of [
  "privateMediaFlag === 'true' && authMode === 'server-otp'",
  "mode === 'private-session' ? 'private-media' : 'local-preview-media'",
  '`/api/${route}/${contentId}`',
  'image: `${basePath}/image`',
  'wordAudio: `${basePath}/word-audio`',
  'sentenceAudio: `${basePath}/sentence-audio`',
]) {
  if (!startMediaSource.includes(required)) {
    throw new Error(`Private media client safeguard missing: ${required}`);
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
