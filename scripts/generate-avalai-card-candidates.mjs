import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const localEnvPath = resolve('.env.avalai.local');
const draftsPath = resolve(
  'content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json',
);
const outputDirectory = '/Users/test/.codex/tmp/learnbox-avalai/card-candidates';
const requestedIds = process.argv.slice(2);

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

const drafts = JSON.parse(readFileSync(draftsPath, 'utf8'));
const candidates = requestedIds.length
  ? drafts.items.filter((item) => requestedIds.includes(item.id))
  : drafts.items;
if (!candidates.length || (requestedIds.length && candidates.length !== requestedIds.length)) {
  throw new Error('شناسهٔ یک یا چند کارت برای تولید تصویر معتبر نیست.');
}

mkdirSync(outputDirectory, { recursive: true });

const visualOverrides = {
  'start-a1-entschuldigung':
    'A single adult person with one hand gently over the chest and a small respectful bowed posture, clearly communicating an apology.',
  'start-a1-gluecklich':
    'A single adult person with a warm joyful smile and a relaxed upright posture, clearly communicating happiness.',
  'start-a1-guten-tag':
    'Two adult people facing each other at a comfortable distance, each giving a gentle friendly wave in greeting.',
  'start-a1-klein':
    'One clearly tiny wooden toy cube next to one much larger plain wooden cube, making the small size unmistakable.',
  'start-a1-lernen':
    'A clean open blank notebook with a pencil beside it, clearly communicating studying; the pages must be completely empty.',
  'start-a1-muede':
    'A single adult person sitting on the edge of a bed with eyes gently closed and a clear yawn, communicating tiredness.',
  'start-a1-wie-geht-es-ihnen':
    'Two adult people facing each other in a warm polite conversation, with attentive posture and no speech bubbles.',
};

function buildPrompt(item) {
  const visualBrief = item.imagePrompt
    .replace(/,?\s*small canonical Bobo[^,.]*/gi, '')
    .replace(/,?\s*optional small canonical Bobo[^,.]*/gi, '');
  return [
    'Use case: scientific-educational vocabulary card illustration.',
    `Primary request: ${visualOverrides[item.id] ?? `${item.visualConcept} ${visualBrief}`}`,
    'Use a soft 3D educational illustration with one dominant subject and a clean controlled warm off-white background.',
    'Never render any text, word, label, letter, number, symbol, watermark or logo anywhere in the image.',
    'No Bobo, no people and no unrelated objects.',
    'Keep the subject large, centered and readable at small mobile-card size.',
  ].join(' ');
}

async function generate(item) {
  const response = await fetch('https://api.avalai.ir/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'flux.2-pro',
      prompt: buildPrompt(item),
      size: '1024x1024',
      n: 1,
      response_format: 'b64_json',
    }),
  });
  if (!response.ok) throw new Error(`${item.id}: HTTP ${response.status}`);

  const payload = await response.json();
  const image = payload?.data?.[0];
  const encodedImage = image?.b64_json;
  const imageUrl = image?.url ?? image?.image_url?.url;
  const outputPath = `${outputDirectory}/${item.id}-image-flux2-candidate.png`;
  if (typeof encodedImage === 'string') {
    writeFileSync(outputPath, Buffer.from(encodedImage, 'base64'));
  } else if (typeof imageUrl === 'string') {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error(`${item.id}: output HTTP ${imageResponse.status}`);
    writeFileSync(outputPath, Buffer.from(await imageResponse.arrayBuffer()));
  } else {
    throw new Error(`${item.id}: پاسخ تصویری قابل ذخیره ندارد.`);
  }
  console.log(`${item.id}: ${outputPath}`);
}

const queue = [...candidates];
const workerCount = Math.min(2, queue.length);
await Promise.all(
  Array.from({ length: workerCount }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item) await generate(item);
    }
  }),
);
