#!/usr/bin/env node
/**
 * M4.3 mutation battery.
 *
 * The learner slider makes claims a green suite can easily fake: "only active slides, only inside
 * their window", "at most three", "private image bytes never reach an anonymous caller", "an unsafe
 * destination is never handed to the app", "a retired slide's image stops being served", "the
 * carousel is operable and accessible", "Today keeps working when the slider does not". Each of
 * those is a property of code that otherwise looks like ordinary fetching and rendering, so each
 * one is broken here on purpose in the most plausible wrong way — the activation filter dropped,
 * the window dropped, the cap raised, the bytes selected into the list, the auth gate removed, the
 * https check removed, the `aria-hidden` defect restored, the reduced-motion check removed, the
 * pack id thrown away — and the suites must FAIL for every one. A survivor means that property is
 * asserted nowhere, and the milestone's evidence is decoration.
 *
 * Sources are restored after each run, and a non-clean worktree aborts the battery rather than
 * risking an operator's uncommitted work.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const rule = 'apps/website/lib/learner-slider.ts';
const slidesRoute = 'apps/website/app/api/banners/route.ts';
const imageRoute = 'apps/website/app/api/banners/[id]/image/route.ts';
const today = 'apps/website/app/components/TodayScreen.tsx';
const store = 'apps/website/app/components/StoreScreen.tsx';
const home = 'apps/website/app/LearnerHome.tsx';

const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) throw new Error('TEST_DATABASE_URL is required: the proof is worthless without the DB');

const mutants = [
  // ---- Only active slides, only inside their scheduling window. ----
  {
    id: 'MUT1',
    claim: 'a deactivated slide is not delivered',
    file: rule,
    from: `export const deliverableSlidePredicate = \`is_active = true
     AND (starts_at IS NULL OR starts_at <= NOW())`,
    to: `export const deliverableSlidePredicate = \`(is_active = true OR is_active = false)
     AND (starts_at IS NULL OR starts_at <= NOW())`,
  },
  {
    id: 'MUT2',
    claim: 'a slide that has not started yet is not delivered',
    file: rule,
    from: `     AND (starts_at IS NULL OR starts_at <= NOW())
     AND (ends_at IS NULL OR ends_at >= NOW())`,
    to: `     AND (ends_at IS NULL OR ends_at >= NOW())`,
  },
  {
    id: 'MUT3',
    claim: 'an expired slide is not delivered',
    file: rule,
    from: `     AND (ends_at IS NULL OR ends_at >= NOW())
     AND link_type IN ('screen', 'pack', 'url')`,
    to: `     AND link_type IN ('screen', 'pack', 'url')`,
  },
  {
    id: 'MUT4',
    claim: 'a row with no destination at all is not delivered',
    file: rule,
    from: `     AND link_type IN ('screen', 'pack', 'url')
     AND link_url IS NOT NULL\``,
    to: `\``,
  },

  // ---- Order and number. ----
  {
    id: 'MUT5',
    claim: 'the authored order is respected',
    file: rule,
    from: `    ORDER BY sort_order ASC, created_at DESC, id ASC`,
    to: `    ORDER BY created_at ASC`,
  },
  {
    id: 'MUT6',
    claim: 'two slides sharing a position still come back in a stable order',
    file: rule,
    from: `    ORDER BY sort_order ASC, created_at DESC, id ASC
    LIMIT`,
    to: `    ORDER BY sort_order ASC, created_at DESC
    LIMIT`,
  },
  {
    id: 'MUT7',
    claim: 'at most three slides are delivered',
    file: rule,
    from: `export const maximumDeliveredSlides = 3;`,
    to: `export const maximumDeliveredSlides = 5;`,
  },
  {
    id: 'MUT8',
    claim: 'the delivery cap is applied at all',
    file: rule,
    from: `    if (slides.length >= maximumDeliveredSlides) break;`,
    to: `    if (false) break;`,
  },
  {
    id: 'MUT9',
    claim: 'the cap counts slides a learner can use, not rows read',
    file: rule,
    from: `export const slideCandidateLimit = 8;`,
    to: `export const slideCandidateLimit = 3;`,
  },

  // ---- Private bytes never travel inside a list. ----
  {
    id: 'MUT10',
    claim: 'the list says whether a slide has an image, never carries the bytes',
    file: rule,
    from: `          image_data IS NOT NULL AS has_image`,
    to: `          image_data, image_data IS NOT NULL AS has_image`,
  },
  {
    id: 'MUT11',
    claim: 'the delivered slide carries only what the carousel needs',
    file: rule,
    from: `    slides.push({
      id,`,
    to: `    slides.push({
      ...(row as object),
      id,`,
  },
  {
    id: 'MUT12',
    claim: 'the legacy third-party image URL is never delivered',
    file: rule,
    from: `export const learnerSlidesSql = \`SELECT id, title, description, background_color, link_type, link_url,`,
    to: `export const learnerSlidesSql = \`SELECT id, title, description, background_color, link_type, link_url, image_url,`,
  },
  {
    id: 'MUT13',
    claim: 'a slide without canonical bytes is reported as having no image',
    file: rule,
    from: `      hasImage: row.has_image === true,`,
    to: `      hasImage: true,`,
  },

  // ---- Destinations are revalidated on delivery, not trusted. ----
  {
    id: 'MUT14',
    claim: 'an external destination must be https',
    file: rule,
    from: `  if (url.protocol !== 'https:') return undefined;`,
    to: `  if (url.protocol !== 'https:' && url.protocol !== 'about:') return undefined;`,
  },
  {
    id: 'MUT15',
    claim: 'an external destination carries no embedded credentials',
    file: rule,
    from: `  if (url.username || url.password) return undefined;`,
    to: `  if (false) return undefined;`,
  },
  {
    id: 'MUT16',
    claim: 'an external destination uses no custom port',
    file: rule,
    from: `  if (url.port) return undefined;`,
    to: `  if (false) return undefined;`,
  },
  {
    id: 'MUT17',
    claim: 'an external destination is a public hostname, not an IP literal',
    file: rule,
    from: `  if (ipv4Pattern.test(host) || host.includes(':')) return undefined;`,
    to: `  if (false) return undefined;`,
  },
  {
    id: 'MUT18',
    claim: 'an external destination is not a private-network name',
    file: rule,
    from: `  if (host === 'localhost' || blockedHostSuffixes.some((suffix) => host.endsWith(suffix))) {
    return undefined;
  }`,
    to: `  if (false) {
    return undefined;
  }`,
  },
  {
    id: 'MUT19',
    claim: 'an internal screen destination is one of the learner screens',
    file: rule,
    from: `    return isDeliverableScreen(linkUrl) ? { kind: 'screen', screen: linkUrl } : undefined;`,
    to: `    return { kind: 'screen', screen: linkUrl as DeliverableScreen };`,
  },
  {
    id: 'MUT20',
    claim: 'a pack destination is a canonical pack id',
    file: rule,
    from: `    return packIdPattern.test(linkUrl) ? { kind: 'pack', packId: linkUrl } : undefined;`,
    to: `    return { kind: 'pack', packId: linkUrl };`,
  },
  {
    id: 'MUT21',
    claim: 'a stored external URL is revalidated before it is delivered',
    file: rule,
    from: `    const url = parseSafeExternalUrl(linkUrl);
    return url ? { kind: 'url', url } : undefined;`,
    to: `    return { kind: 'url', url: linkUrl };`,
  },
  {
    id: 'MUT22',
    claim: 'a row whose destination cannot be used is dropped, not delivered blank',
    file: rule,
    from: `    const destination = readDeliverableDestination(row.link_type, row.link_url);
    if (!destination) continue;`,
    to: `    const destination = (readDeliverableDestination(row.link_type, row.link_url) ??
      { kind: 'screen', screen: 'today' }) as SlideDestination;`,
  },

  // ---- The protected routes. ----
  {
    id: 'MUT23',
    claim: 'the slider is not served to an anonymous caller',
    file: slidesRoute,
    from: `  if (!(await authenticateLearner(request)))`,
    to: `  if (false)`,
  },
  {
    id: 'MUT24',
    claim: 'the slider response is never cached beyond the learner who asked',
    file: slidesRoute,
    from: `  const headers = { 'Cache-Control': 'private, no-store' };`,
    to: `  const headers = { 'Cache-Control': 'public, max-age=3600' };`,
  },
  {
    id: 'MUT25',
    claim: 'the route runs the canonical rule rather than one of its own',
    file: slidesRoute,
    from: `    const result = await pool.query(learnerSlidesSql);`,
    to: `    const result = await pool.query('SELECT id, title, link_type, link_url FROM banners');`,
  },
  {
    id: 'MUT26',
    claim: 'an unreadable slider leaves Today working',
    file: slidesRoute,
    from: `  } catch {
    return Response.json({ slides: [] }, { headers });`,
    to: `  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500, headers });`,
  },
  {
    id: 'MUT27',
    claim: 'image bytes are never served to an anonymous caller',
    file: imageRoute,
    from: `  if (!(await authenticateLearner(request))) {`,
    to: `  if (false) {`,
  },
  {
    id: 'MUT28',
    claim: 'image bytes are not cached by anything between server and learner',
    file: imageRoute,
    from: `        'Cache-Control': 'private, no-store',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',`,
    to: `        'Cache-Control': 'public, max-age=86400',`,
  },
  {
    id: 'MUT29',
    claim: 'a slide id is matched against its shape before it reaches the database',
    file: imageRoute,
    from: `  if (!isSlideId(id)) {`,
    to: `  if (false) {`,
  },
  {
    id: 'MUT30',
    claim: 'an image obeys the same delivery rule as the slide that carries it',
    file: rule,
    from: `export const learnerSlideImageSql = \`SELECT image_data
     FROM banners
    WHERE id = $1
      AND image_data IS NOT NULL
      AND \${deliverableSlidePredicate}`,
    to: `export const learnerSlideImageSql = \`SELECT image_data
     FROM banners
    WHERE id = $1
      AND image_data IS NOT NULL`,
  },
  {
    id: 'MUT31',
    claim: 'an unavailable image is not reported as a server crash on the home screen',
    file: imageRoute,
    from: `    return new Response('Image unavailable', {
      status: 503,`,
    to: `    return new Response('Image unavailable', {
      status: 200,`,
  },

  // ---- The carousel on Today. ----
  {
    id: 'MUT32',
    claim: 'the real Admin image is rendered from the protected media route',
    file: today,
    from: `                          src={\`/api/banners/\${encodeURIComponent(slide.id)}/image\`}`,
    to: `                          src={\`/images/banners/\${slide.id}.webp\`}`,
  },
  {
    id: 'MUT33',
    claim: 'an image that fails to load falls back instead of staying broken',
    file: today,
    from: `                          onError={() =>
                            setBrokenImages((broken) => ({ ...broken, [slide.id]: true }))
                          }`,
    to: `                          onError={() => undefined}`,
  },
  {
    id: 'MUT34',
    claim: 'the pagination buttons are not hidden from assistive technology',
    file: today,
    from: `              <div className="banner-dots" role="group" aria-label="انتخاب بنر">`,
    to: `              <div className="banner-dots" aria-hidden="true">`,
  },
  {
    id: 'MUT35',
    claim: 'an off-screen slide is not a hidden tab stop',
    file: today,
    from: `                    tabIndex={current ? 0 : -1}`,
    to: `                    tabIndex={0}`,
  },
  {
    id: 'MUT36',
    claim: 'an off-screen slide is not announced as if it were on screen',
    file: today,
    from: `                    aria-hidden={current ? undefined : true}`,
    to: `                    aria-hidden={undefined}`,
  },
  {
    id: 'MUT37',
    claim: 'auto-rotation stops for a learner who asked for less motion',
    file: today,
    from: `      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;`,
    to: `      if (false) return;`,
  },
  {
    id: 'MUT38',
    claim: 'the carousel rotates on its own for everyone else',
    file: today,
    from: `    timerRef.current = setInterval(() => {
      setBannerIdx((i) => (i + 1) % banners.length);
    }, 4000);`,
    to: `    timerRef.current = null;`,
  },
  {
    id: 'MUT39',
    claim: 'a swipe is not also read as a tap on the slide',
    file: today,
    from: `                      if (swipedRef.current) {
                        swipedRef.current = false;
                        return;
                      }`,
    to: `                      if (false) {
                        return;
                      }`,
  },
  {
    id: 'MUT40',
    claim: 'a tap is not read as a swipe',
    file: today,
    from: `    if (Math.abs(travelled) < 40) return;`,
    to: `    if (Math.abs(travelled) < 0) return;`,
  },
  {
    id: 'MUT41',
    claim: 'a swipe moves the carousel',
    file: today,
    from: `    setBannerIdx((index) =>
      travelled < 0 ? (index + 1) % slideCount : (index - 1 + slideCount) % slideCount,
    );`,
    to: `    setBannerIdx((index) => index);`,
  },
  {
    id: 'MUT42',
    claim: 'a pack slide asks for that pack, not merely for the Store',
    file: today,
    from: `    if (destination.kind === 'pack') {
      onNavigateToPack?.(destination.packId);
      return;
    }`,
    to: `    if (destination.kind === 'pack') {
      onNavigate?.('store');
      return;
    }`,
  },
  {
    id: 'MUT43',
    claim: 'an external link is opened without a handle back to the app',
    file: today,
    from: `      window.open(destination.url, '_blank', 'noopener,noreferrer');`,
    to: `      window.open(destination.url, '_blank');`,
  },
  {
    id: 'MUT44',
    claim: 'the client does not open a non-https destination even if one reaches it',
    file: today,
    from: `    if (destination.kind === 'url' && destination.url.startsWith('https://')) {`,
    to: `    if (destination.kind === 'url') {`,
  },
  {
    id: 'MUT45',
    claim: 'no more than three slides are ever presented',
    file: today,
    from: `          setBanners(data.slides.slice(0, maximumDeliveredSlides));`,
    to: `          setBanners(data.slides);`,
  },
  {
    id: 'MUT46',
    claim: 'the slider is read from the canonical learner read path',
    file: today,
    from: `    fetch('/api/banners', { cache: 'no-store', credentials: 'same-origin' })`,
    to: `    fetch('/api/banners?legacy=1', { cache: 'no-store', credentials: 'same-origin' })`,
  },

  // ---- The pack destination inside the Store. ----
  {
    id: 'MUT47',
    claim: 'only the pack the slide asked for is marked',
    file: store,
    from: `                          }\${focusPackId === pack.id ? ' slide-focused' : ''}\``,
    to: `                          }\${focusPackId !== null ? ' slide-focused' : ''}\``,
  },
  {
    id: 'MUT48',
    claim: 'the requested pack is brought into view',
    file: store,
    from: `      card.scrollIntoView({ block: 'center', behavior: 'smooth' });`,
    to: `      void card;`,
  },
  {
    id: 'MUT49',
    claim: 'the requested pack is announced as the current one',
    file: store,
    from: `                          aria-current={focusPackId === pack.id ? 'true' : undefined}`,
    to: `                          aria-current={undefined}`,
  },
  {
    id: 'MUT50',
    claim: 'a pack the Store does not offer is not treated as present',
    file: store,
    from: `    focusPackId !== null && catalogue.some((pack) => pack.id === focusPackId);`,
    to: `    focusPackId !== null;`,
  },

  // ---- The wiring between a slide and the Store. ----
  {
    id: 'MUT51',
    claim: 'the pack a slide asked for reaches the Store screen',
    file: home,
    from: `        focusPackId={slidePackId}`,
    to: `        focusPackId={null}`,
  },
  {
    id: 'MUT52',
    claim: 'the pack id is remembered when the slide is tapped',
    file: home,
    from: `        onNavigateToPack={(packId) => {
          setSlidePackId(packId);
          setScreen('store');
        }}`,
    to: `        onNavigateToPack={() => {
          setScreen('store');
        }}`,
  },
  {
    id: 'MUT53',
    claim: 'the pack is forgotten once the learner navigates themselves',
    file: home,
    from: `        onNavigate={(dest) => {
          setSlidePackId(null);
          setScreen(dest as typeof screen);
        }}`,
    to: `        onNavigate={(dest) => {
          setScreen(dest as typeof screen);
        }}`,
  },
];

function run(command, args, cwd) {
  try {
    execFileSync(command, args, {
      cwd,
      stdio: 'ignore',
      env: { ...process.env, TEST_DATABASE_URL: dbUrl },
    });
    return true;
  } catch {
    return false;
  }
}

function suitesPass() {
  const website = run(
    'node_modules/.bin/vitest',
    [
      'run',
      'test/m4.3-learner-slider-db.test.ts',
      'test/m4.3-learner-slider-routes.test.ts',
      'test/m4.3-today-slider-ui.test.tsx',
      'test/m4.3-store-pack-destination.test.tsx',
      'test/release-protected-routes.test.ts',
    ],
    join(repoRoot, 'apps/website'),
  );
  if (!website) return false;
  // The Admin half of the same contract: what the Slider Manager publishes is what the canonical
  // learner rule delivers. A mutant that breaks the shared rule must be caught from both sides.
  return run(
    'node_modules/.bin/vitest',
    ['run', 'test/m4.2-presentation-slides-db.test.ts'],
    join(repoRoot, 'apps/admin'),
  );
}

const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });

// `--check-anchors` verifies every anchor still matches exactly one place and stops. Useful after a
// reformat, because a stale anchor costs a whole battery run to discover otherwise.
if (process.argv.includes('--check-anchors')) {
  let bad = 0;
  for (const mutant of mutants) {
    const source = readFileSync(join(repoRoot, mutant.file), 'utf8');
    const occurrences = source.split(mutant.from).length - 1;
    if (occurrences !== 1) {
      bad += 1;
      console.log(`${mutant.id} anchor matches ${occurrences} places in ${mutant.file}`);
    }
  }
  console.log(bad === 0 ? `all ${mutants.length} anchors unique` : `${bad} bad anchors`);
  process.exit(bad === 0 ? 0 : 1);
}

if (dirty.trim().length > 0) {
  console.log('worktree not clean — commit first so a failed restore cannot lose work:\n' + dirty);
  process.exit(2);
}

console.log('baseline (unmutated) must pass...');
if (!suitesPass()) {
  console.log('BASELINE FAILED — fix the suite before trusting any mutant result');
  process.exit(1);
}
console.log('baseline PASS\n');

const survivors = [];
const harnessErrors = [];
for (const mutant of mutants) {
  const path = join(repoRoot, mutant.file);
  const original = readFileSync(path, 'utf8');
  // An anchor present more than once is a HARNESS failure, not a survivor: `replace` rewrites the
  // first occurrence, so a duplicated anchor can mutate a path these suites never run and then
  // report SURVIVED for a property that is in fact asserted — which reads exactly like a real
  // coverage gap, the most expensive way for this script to be wrong.
  const occurrences = original.split(mutant.from).length - 1;
  if (occurrences !== 1) {
    const detail = occurrences === 0 ? 'anchor missing' : `anchor matches ${occurrences} places`;
    console.log(`${mutant.id} HARNESS ERROR (${detail}) — ${mutant.claim}`);
    harnessErrors.push(`${mutant.id} (${detail})`);
    continue;
  }
  writeFileSync(path, original.replace(mutant.from, mutant.to));
  const stillGreen = suitesPass();
  writeFileSync(path, original);
  if (readFileSync(path, 'utf8') !== original) {
    console.log(`${mutant.id} FATAL — ${mutant.file} not restored`);
    process.exit(2);
  }
  console.log(`${mutant.id} ${stillGreen ? 'SURVIVED' : 'KILLED  '} — ${mutant.claim}`);
  if (stillGreen) survivors.push(`${mutant.id}: ${mutant.claim}`);
}

console.log(
  `\n${mutants.length - survivors.length - harnessErrors.length}/${mutants.length} killed`,
);
if (harnessErrors.length > 0) {
  console.log(
    'HARNESS ERRORS (no verdict earned):\n' + harnessErrors.map((item) => `  - ${item}`).join('\n'),
  );
}
if (survivors.length > 0) {
  console.log('SURVIVORS:\n' + survivors.map((item) => `  - ${item}`).join('\n'));
}
if (survivors.length > 0 || harnessErrors.length > 0) process.exit(1);
console.log('ALL MUTANTS KILLED');
