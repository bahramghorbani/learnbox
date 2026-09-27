import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { wordPhrase } from './avalai-audio-phrase.mjs';

const localEnvPath = resolve('.env.avalai.local');
const draftsPath = resolve(
  'content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json',
);
const outputDirectory = '/Users/test/.codex/tmp/learnbox-avalai/audio-candidates';

// Issue #59: regenerated word audio must carry the displayed article
// (`das Haus`), which the V1 candidates did not. New clips are written as
// `-v2.mp3` so the approved V1 files are never overwritten.
const clipVersion = process.env.AUDIO_CLIP_VERSION ?? 'v2';

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
const clips = drafts.items.flatMap((item) => [
  { id: `${item.id}-word`, text: wordPhrase(item) },
  { id: `${item.id}-sentence`, text: item.examples[0].german },
]);
mkdirSync(outputDirectory, { recursive: true });

async function generate(clip) {
  const response = await fetch('https://api.avalai.ir/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'eleven_flash_v2_5',
      voice: 'coral',
      input: clip.text,
      response_format: 'mp3',
    }),
  });
  if (!response.ok) throw new Error(`${clip.id}: HTTP ${response.status}`);

  const outputPath = `${outputDirectory}/${clip.id}-${clipVersion}.mp3`;
  writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
  console.log(`${clip.id}: ${outputPath}`);
}

const queue = [...clips];
const workerCount = Math.min(3, queue.length);
await Promise.all(
  Array.from({ length: workerCount }, async () => {
    while (queue.length) {
      const clip = queue.shift();
      if (clip) await generate(clip);
    }
  }),
);
