import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const localEnvPath = resolve('.env.avalai.local');
const outputDirectory = '/Users/test/.codex/tmp/learnbox-avalai/audio-candidates';
const repairs = [
  { id: 'start-a1-brot-word', text: 'Brot' },
  { id: 'start-a1-tuer-word', text: 'Tür' },
];

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

async function generate(clip) {
  const response = await fetch('https://api.avalai.ir/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: clip.text,
      instructions:
        'Sprich dieses einzelne Wort in natürlichem, deutlichem Standarddeutsch aus. Keine zusätzliche Erklärung.',
      response_format: 'mp3',
    }),
  });
  if (!response.ok) throw new Error(`${clip.id}: HTTP ${response.status}`);

  const outputPath = `${outputDirectory}/${clip.id}-v3.mp3`;
  writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
  console.log(`${clip.id}: ${outputPath}`);
}

for (const clip of repairs) await generate(clip);
