import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import test from 'node:test';
import { productStoryStages } from '../app/components/landing/product-story-data.ts';

const appRoot = resolve(import.meta.dirname, '..');
const sourceExtensions = new Set(['.ts', '.tsx', '.css']);

function collectSource(directory) {
  if (!existsSync(directory)) return '';

  return readdirSync(directory, { withFileTypes: true })
    .map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectSource(path);
      if (!sourceExtensions.has(extname(entry.name))) return '';
      return readFileSync(path, 'utf8');
    })
    .join('\n');
}

const landingSource = collectSource(join(appRoot, 'app'));
const themeSource = collectSource(join(appRoot, 'src', 'themes', 'summer'));
const allSource = `${landingSource}\n${themeSource}`;
const normalizedSource = allSource.replace(/\s+/g, ' ');
const productScreenRoot = join(appRoot, 'public', 'product', 'screens', 'v1');

const canonicalBuBuHashes = {
  'cards-recovery-v3.png': 'fbe865ab977b9f1388c7713854cb11bb828fa5a51efb5666035502bc16ed1453',
  'finale-invite-v3.png': 'a95193a4fb843d41c5139366eabe9f9038e9ce3e995ae4730d9bead825b2c43a',
  'hero-wave-v3.png': '6a2caa8ad1421398df407aa60549c67df7e528f033fa34851e7c1f89cbd1887c',
  'learning-focus-v3.png': 'ae65486a2341f3efac15f8b73809119ec3181b8a383586a48dba71f18cfe9085',
  'progress-celebrate-v3.png': '06b57dee703c6660c0a2f334e8531ae2240a278266d3c43e3e984a6b397b4a8c',
};

test('locks the truthful product-story contract and versioned assets', () => {
  assert.deepEqual(
    productStoryStages.map(({ id }) => id),
    ['start', 'today', 'return', 'progress'],
  );
  assert.equal(new Set(productStoryStages.map(({ image }) => image.src)).size, 4);

  for (const stage of productStoryStages) {
    assert.equal(stage.image.width, 1080);
    assert.equal(stage.image.height, 1920);
    assert.match(stage.image.alt, /LearnBox/);
    assert.ok(
      existsSync(join(appRoot, 'public', stage.image.src)),
      `Missing product screen: ${stage.image.src}`,
    );
    assert.doesNotMatch(
      `${stage.eyebrow} ${stage.title} ${stage.description}`,
      /منتشر شده|هم‌اکنون دانلود|بازار|مایکت|App Store|اپ[‌ ]?استور/,
      `Unsupported marketplace or release claim in ${stage.id}`,
    );
  }

  for (const filename of [
    'start-journey.jpeg',
    'today.jpeg',
    'calm-return.jpeg',
    'progress.jpeg',
  ]) {
    assert.ok(
      existsSync(join(productScreenRoot, filename)),
      `Missing versioned screen: ${filename}`,
    );
  }

  const bubuRoot = join(appRoot, 'public', 'themes', 'summer', 'bubu');
  for (const [filename, expectedHash] of Object.entries(canonicalBuBuHashes)) {
    const actualHash = createHash('sha256')
      .update(readFileSync(join(bubuRoot, filename)))
      .digest('hex');
    assert.equal(actualHash, expectedHash, `Canonical BuBu asset changed: ${filename}`);
  }
});

const exactCopy = [
  'کلمه‌ها را فقط حفظ نکن؛ برای همیشه یاد بگیر.',
  'LearnBox با مرور هوشمند، جعبه لایتنر و تمرین‌های کوتاه روزانه کمک می‌کند واژه‌های آلمانی را بهتر یاد بگیری و درست در زمانی که لازم است، دوباره مرورشان کنی.',
  'یادگیری را شروع کن',
  'ببین LearnBox چطور کار می‌کند',
  'چرا کلمه‌هایی که یاد می‌گیریم، خیلی زود فراموش می‌شوند؟',
  'وقتی واژه‌ها بدون برنامه و فقط یک‌بار مرور شوند، حتی کلمه‌های مهم هم بعد از چند روز از ذهن دور می‌شوند. LearnBox زمان مناسب مرور هر واژه را پیدا می‌کند تا پیش از فراموش‌شدن، دوباره آن را ببینی.',
  'هر کلمه، در زمان مناسب دوباره برمی‌گردد.',
  'واژه‌های دشوار زودتر مرور می‌شوند و واژه‌هایی که بهتر یاد گرفته‌ای، با فاصله بیشتری بازمی‌گردند. به این شکل، وقتت را بیشتر روی چیزهایی می‌گذاری که واقعاً به تمرین نیاز دارند.',
  'مرور فاصله‌دار',
  'تمرکز روی واژه‌های دشوار',
  'برنامه مرور روزانه',
  'کاهش فراموشی',
  'کلمه را در متن، تصویر و صدا یاد بگیر.',
  'فقط دیدن ترجمه برای یادگیری عمیق کافی نیست. تلفظ، مثال کاربردی، تصویر و اطلاعات مهم هر واژه کمک می‌کنند آن را بهتر به خاطر بسپاری و در مکالمه راحت‌تر استفاده کنی.',
  'مسیر یادگیری را با هدف خودت هماهنگ کن.',
  'چه برای مهاجرت کاری و تحصیلی آماده می‌شوی، چه می‌خواهی در مکالمه روزمره پیشرفت کنی، مسیرهای LearnBox کمک می‌کنند از واژه‌هایی شروع کنی که به هدف واقعی تو نزدیک‌ترند.',
  'مهاجرت کاری',
  'مهاجرت تحصیلی',
  'مکالمه روزمره',
  'زبان عمومی',
  'آمادگی آزمون',
  'هر روز کمی جلو برو، اما متوقف نشو.',
  'هدف‌های روزانه، امتیازها، نشان‌ها و همراهی BuBu کمک می‌کنند مرور واژه‌ها به بخشی ساده و لذت‌بخش از برنامه روزانه‌ات تبدیل شود.',
  'یادگیری ساده، منظم و همیشه در دسترس.',
  'مرورهای امروز، میزان پیشرفت و واژه‌هایی که به تمرین بیشتری نیاز دارند، همه در یک محیط روشن و قابل‌فهم در اختیار تو هستند.',
  'از همین امروز یادگیری را شروع کن.',
  'نسخه اندروید LearnBox را از کافه‌بازار دریافت کن یا با نسخه وب روی iPhone، iPad و مرورگرهای پشتیبانی‌شده، مسیر یادگیری‌ات را ادامه بده.',
  'دانلود از کافه‌بازار',
  'ورود به نسخه وب',
  'بیرون از اپ هم کنار LearnBox بمان.',
  'خبرهای محصول، محتوای آموزشی، نکته‌های یادگیری و مسیر توسعه LearnBox را از شبکه‌های رسمی دنبال کن.',
  'اولین کلمه، شروع یک مسیر تازه است.',
  'BuBu آماده است تا در مرورهای روزانه همراهت باشد. تو فقط کافی است اولین قدم را برداری.',
  'یادگیری را با BuBu شروع کن',
];

test('contains every approved V3 copy line', () => {
  for (const copy of exactCopy) {
    assert.ok(
      normalizedSource.includes(copy.replace(/\s+/g, ' ')),
      `Missing approved copy: ${copy}`,
    );
  }
});

test('has a modular summer theme contract', () => {
  const summerRoot = join(appRoot, 'src', 'themes', 'summer');
  for (const file of ['tokens.ts', 'SummerBackdrop.tsx', 'summer-theme.css', 'index.ts']) {
    assert.ok(existsSync(join(summerRoot, file)), `Missing summer theme file: ${file}`);
  }
});

test('keeps all focused comparison variants noindex', () => {
  for (const variant of ['a', 'b', 'c']) {
    const route = join(appRoot, 'app', 'dev', `landing-variant-${variant}`, 'page.tsx');
    assert.ok(existsSync(route), `Missing variant route: ${variant}`);
    const source = readFileSync(route, 'utf8');
    assert.match(source, /robots\s*:/, `Variant ${variant} needs robots metadata`);
    assert.match(source, /index\s*:\s*false/, `Variant ${variant} must be noindex`);
    assert.match(source, /follow\s*:\s*false/, `Variant ${variant} must be nofollow`);
  }
});

test('is explicitly a German-learning landing without an App Store claim', () => {
  assert.match(allSource, /lang=["']de["']/);
  assert.match(allSource, /(Berlin|برلین|Brandenburg|کلن|Rhine|راین)/);
  assert.doesNotMatch(allSource, /App Store|اپ‌استور|اپ استور/);
});

test('defers scroll motion and keeps compact CSS interaction motion with reduced-motion fallbacks', () => {
  assert.match(allSource, /import\(['"]gsap['"]\)/);
  assert.match(allSource, /import\(['"]gsap\/ScrollTrigger['"]\)/);
  assert.doesNotMatch(
    allSource,
    /import\s+\{\s*gsap\s*\}\s+from\s+['"]gsap['"]/,
    'GSAP must stay out of the initial client bundle',
  );
  assert.doesNotMatch(allSource, /from ['"]motion\/react['"]/);
  assert.match(allSource, /mobile-nav--enter/);
  assert.match(allSource, /path-copy--enter/);
  assert.match(allSource, /@keyframes mobile-nav-enter/);
  assert.match(allSource, /@keyframes path-copy-enter/);
  assert.match(allSource, /\.hero-shell > \.landing-header/);
  assert.match(allSource, /requestIdleCallback/);
  assert.match(allSource, /ScrollTrigger/);
  assert.match(allSource, /prefers-reduced-motion:\s*reduce/);
  assert.match(allSource, /reducedMotion/);
});

test('gives every landing segment a layered German scroll chapter', () => {
  for (const chapter of [
    'station',
    'rail',
    'street',
    'map',
    'park',
    'harbor',
    'square',
    'garden',
  ]) {
    assert.match(allSource, new RegExp(`chapter=["']${chapter}["']`));
  }

  for (const layer of ['far', 'mid', 'route', 'near', 'accent']) {
    assert.match(allSource, new RegExp(`data-chapter-layer=["']${layer}["']`));
  }

  assert.match(allSource, /data-chapter-backdrop/);
  assert.match(allSource, /chapterBackdrops/);
  assert.doesNotMatch(
    allSource,
    /filter:\s*['"]brightness/,
    'Scroll-linked chapter motion must avoid paint-heavy brightness filters',
  );
});

test('uses recognizable German landmarks without sacrificing copy legibility', () => {
  for (const landmark of [
    'u-bahn',
    'fernsehturm',
    'deutschland-map',
    'olympiapark',
    'elbphilharmonie',
    'brandenburg-gate',
    'garden-sign',
  ]) {
    assert.match(allSource, new RegExp(`data-chapter-landmark=["']${landmark}["']`));
  }

  assert.match(allSource, /chapter-heading-veil/);
  assert.match(allSource, /chapterLandmark/);
});
