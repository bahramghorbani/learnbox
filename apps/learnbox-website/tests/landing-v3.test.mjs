import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import test from 'node:test';

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
    assert.ok(allSource.includes(copy), `Missing approved copy: ${copy}`);
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

test('uses the approved motion stack with reduced-motion fallbacks', () => {
  assert.match(allSource, /from ['"]motion\/react['"]/);
  assert.match(allSource, /from ['"]gsap['"]/);
  assert.match(allSource, /ScrollTrigger/);
  assert.match(allSource, /prefers-reduced-motion:\s*reduce/);
  assert.match(allSource, /reducedMotion/);
});
