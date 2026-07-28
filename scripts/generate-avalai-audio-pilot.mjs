import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const localEnvPath = resolve('.env.avalai.local');
const outputDirectory = '/Users/test/.codex/tmp/learnbox-avalai/audio-pilot';

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

const clips = [
  { id: 'start-a1-haus-word', text: 'Haus' },
  { id: 'start-a1-haus-sentence', text: 'Das Haus ist klein.' },
];

mkdirSync(outputDirectory, { recursive: true });
for (const clip of clips) {
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

  const outputPath = `${outputDirectory}/${clip.id}-v1.mp3`;
  writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
  console.log(`${clip.id}: ${outputPath}`);
}
