import { access, readFile } from 'node:fs/promises';

const launchExperienceSource = await readFile(
  new URL('../apps/website/app/launch-experience.ts', import.meta.url),
  'utf8',
);
const launchScreenSource = await readFile(
  new URL('../apps/website/app/components/LaunchScreen.tsx', import.meta.url),
  'utf8',
);
const layoutSource = await readFile(
  new URL('../apps/website/app/layout.tsx', import.meta.url),
  'utf8',
);
const manifestSource = await readFile(
  new URL('../apps/website/app/manifest.ts', import.meta.url),
  'utf8',
);
const serviceWorkerSource = await readFile(
  new URL('../apps/website/public/sw.js', import.meta.url),
  'utf8',
);

for (const required of ['germany-welcome-v1', 'germany-welcome-v1.jpg', 'durationMs: 1700']) {
  if (!launchExperienceSource.includes(required)) {
    throw new Error(`Launch experience requirement missing: ${required}`);
  }
}

for (const required of [
  'LaunchScreen',
  'priority',
  'role="status"',
  "state === 'hidden'",
  'imageReady',
  'onLoad={() => setImageReady(true)}',
]) {
  if (!launchScreenSource.includes(required)) {
    throw new Error(`Launch screen safeguard missing: ${required}`);
  }
}

if (!layoutSource.includes('<LaunchScreen />')) {
  throw new Error('Launch screen must render before the application surface.');
}

for (const required of ['learnbox-v1-192.png', 'learnbox-v1-512.png']) {
  if (!manifestSource.includes(required)) {
    throw new Error(`PWA icon declaration missing: ${required}`);
  }
}

for (const required of ['germany-welcome-v1.jpg', 'learnbox-v1-192.png', 'learnbox-v1-512.png']) {
  if (!serviceWorkerSource.includes(required)) {
    throw new Error(`Offline launch asset missing: ${required}`);
  }
}

await Promise.all([
  access(new URL('../apps/website/public/images/launch/germany-welcome-v1.jpg', import.meta.url)),
  access(new URL('../apps/website/public/icons/learnbox-v1-192.png', import.meta.url)),
  access(new URL('../apps/website/public/icons/learnbox-v1-512.png', import.meta.url)),
]);

console.info('Launch experience and installable icon assets are present and release-gated.');
