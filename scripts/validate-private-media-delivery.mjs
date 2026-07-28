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

console.info('Private media delivery remains session-guarded and release-flagged.');
