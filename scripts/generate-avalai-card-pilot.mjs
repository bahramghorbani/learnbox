import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const localEnvPath = resolve('.env.avalai.local');
const outputDirectory = '/Users/test/.codex/tmp/learnbox-avalai';

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
if (!apiKey) throw new Error('کلید AvalAI وارد نشده است.');

const prompt = [
  'Use case: scientific-educational vocabulary card illustration.',
  'Create one soft 3D illustration of a single simple wooden dining table.',
  'The table is the only primary concept and fills the central frame clearly for a beginner German A1 learner.',
  'Use a clean controlled warm off-white studio background with subtle depth only.',
  'No Bobo, no people, no other objects, no food, no chairs, no room scene, no text, no letters, no watermark.',
  'The object must remain recognisable at small mobile-card size.',
].join(' ');

const response = await fetch('https://api.avalai.ir/v1/images/generations', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'flux.2-pro',
    prompt,
    size: '1024x1024',
    n: 1,
    response_format: 'b64_json',
  }),
});

if (!response.ok) {
  throw new Error(`تولید آزمایشی تصویر کارت ناموفق بود (HTTP ${response.status}).`);
}

const payload = await response.json();
const image = payload?.data?.[0];
const encodedImage = image?.b64_json;
const imageUrl = image?.url ?? image?.image_url?.url;

mkdirSync(outputDirectory, { recursive: true });
const outputPath = `${outputDirectory}/start-a1-tisch-image-flux2-pilot.png`;
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

console.log(`نمونهٔ آزمایشی کارت در ${outputPath} ذخیره شد.`);
if (payload.estimated_cost?.unit)
  console.log(`هزینهٔ اعلام‌شده: ${payload.estimated_cost.unit} دلار`);
