import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const localEnvPath = resolve('.env.avalai.local');
const outputDirectory = '/Users/test/.codex/tmp/learnbox-avalai';
const expression = process.argv[2] ?? 'welcome';
const expressionDirections = {
  welcome: 'Welcome expression: one small paw lifted in a quiet friendly greeting.',
  encourage:
    'Encouragement expression: calm supportive warmth, one small paw held gently near the heart.',
  celebrate:
    'Celebration expression: brief joyful delight with both small paws raised, never frantic.',
  recovery:
    'Recovery expression: calm open welcome after a break, relaxed posture and reassuring smile.',
  focus:
    'Focus expression: calm attentive readiness to study, with one clear small forward gesture.',
};

if (!(expression in expressionDirections)) {
  throw new Error(`حالت بوبو معتبر نیست: ${expression}`);
}

const sourcePath = resolve(`apps/website/public/images/bobo/${expression}-v1.png`);
const source = readFileSync(sourcePath);

function getAvalaiKey() {
  if (process.env.AVALAI_API_KEY?.trim()) return process.env.AVALAI_API_KEY.trim();
  if (!existsSync(localEnvPath)) return undefined;

  const line = readFileSync(localEnvPath, 'utf8')
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith('AVALAI_API_KEY='));
  const value = line?.slice('AVALAI_API_KEY='.length).trim();
  return value && value !== 'PASTE_YOUR_KEY_HERE' ? value : undefined;
}

const apiKey = getAvalaiKey();
if (!apiKey) {
  throw new Error('کلید AvalAI وارد نشده است.');
}

const prompt = [
  'Use the supplied image as the sole canonical character reference.',
  'Create one fresh full-body soft 3D studio render of exactly the same LearnBox Bobo character.',
  'Keep a white softly furry single-piece round body with no visible neck, two short attached ears',
  'side by side, dark expressive eyes, gentle peach cheeks and a tiny friendly open smile.',
  'Do not make a rabbit: no long separated ears, no head-and-body split, no clothing, no logo.',
  expressionDirections[expression],
  'Center the complete character with generous padding.',
  'Use a perfectly flat solid #00FF00 chroma-key background only: no floor, no shadow, no reflection,',
  'no texture, no gradient, no text and no watermark. Do not use green on the character.',
].join(' ');

const form = new FormData();
form.append('model', 'gpt-image-1.5');
form.append('image', new Blob([source], { type: 'image/png' }), basename(sourcePath));
form.append('prompt', prompt);
form.append('size', '1024x1536');
form.append('quality', 'high');
form.append('response_format', 'b64_json');

const response = await fetch('https://api.avalai.ir/v1/images/edits', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}` },
  body: form,
});

if (!response.ok) {
  throw new Error(`تولید آزمایشی بوبو ناموفق بود (HTTP ${response.status}).`);
}

const payload = await response.json();
const image = payload?.data?.[0];
const encodedImage = image?.b64_json;
const imageUrl = image?.url ?? image?.image_url?.url;

mkdirSync(outputDirectory, { recursive: true });
const outputPath = `${outputDirectory}/bobo-${expression}-v2-chromakey.png`;
if (typeof encodedImage === 'string') {
  writeFileSync(outputPath, Buffer.from(encodedImage, 'base64'));
} else if (typeof imageUrl === 'string') {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`دریافت فایل تصویر از AvalAI ناموفق بود (HTTP ${imageResponse.status}).`);
  }
  writeFileSync(outputPath, Buffer.from(await imageResponse.arrayBuffer()));
} else {
  const fields = image && typeof image === 'object' ? Object.keys(image).join(', ') : 'بدون داده';
  throw new Error(`پاسخ AvalAI دادهٔ تصویری قابل ذخیره ندارد. فیلدهای دریافت‌شده: ${fields}`);
}
console.log(`نمونهٔ آزمایشی در ${outputPath} ذخیره شد.`);
if (payload.estimated_cost?.unit) {
  console.log(`هزینهٔ اعلام‌شده: ${payload.estimated_cost.unit} دلار`);
}
