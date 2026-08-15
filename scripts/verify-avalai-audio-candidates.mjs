import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { wordPhrase } from './avalai-audio-phrase.mjs';

const localEnvPath = resolve('.env.avalai.local');
const draftsPath = resolve(
  'content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json',
);
const audioDirectory = '/Users/test/.codex/tmp/learnbox-avalai/audio-candidates';
const reportPath =
  '/Users/test/.codex/tmp/learnbox-avalai/audio-candidates/audio-transcription-qa.json';

function getAvalaiKey() {
  if (process.env.AVALAI_API_KEY?.trim()) return process.env.AVALAI_API_KEY.trim();
  if (!existsSync(localEnvPath)) return undefined;
  const line = readFileSync(localEnvPath, 'utf8')
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith('AVALAI_API_KEY='));
  const value = line?.slice('AVALAI_API_KEY='.length).trim();
  return value && value !== 'PASTE_YOUR_KEY_HERE' ? value : undefined;
}

function normalize(text) {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/[.,!?;:"„“”'’()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const apiKey = getAvalaiKey();
if (!apiKey) throw new Error('کلید AvalAI وارد نشده است.');

const drafts = JSON.parse(readFileSync(draftsPath, 'utf8'));
const clips = drafts.items.flatMap((item) => [
  { id: `${item.id}-word`, expected: wordPhrase(item) },
  { id: `${item.id}-sentence`, expected: item.examples[0].german },
]);

async function transcribe(clip) {
  const candidateFilenames = [`${clip.id}-v3.mp3`, `${clip.id}-v2.mp3`, `${clip.id}-v1.mp3`];
  const filename = candidateFilenames.find((candidate) =>
    existsSync(resolve(audioDirectory, candidate)),
  );
  if (!filename) throw new Error(`${clip.id}: فایل صوتی موجود نیست.`);
  const audioPath = resolve(audioDirectory, filename);

  const form = new FormData();
  form.set('model', 'groq.whisper-large-v3-turbo');
  form.set('language', 'de');
  form.set('response_format', 'json');
  form.set('file', new Blob([readFileSync(audioPath)], { type: 'audio/mpeg' }), filename);

  const response = await fetch('https://api.avalai.ir/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) throw new Error(`${clip.id}: HTTP ${response.status}`);

  const payload = await response.json();
  const transcript = typeof payload.text === 'string' ? payload.text.trim() : '';
  return {
    ...clip,
    filename,
    bytes: statSync(audioPath).size,
    transcript,
    normalizedExpected: normalize(clip.expected),
    normalizedTranscript: normalize(transcript),
    matchesExpected: normalize(transcript) === normalize(clip.expected),
  };
}

const results = [];
const queue = [...clips];
const workerCount = Math.min(3, queue.length);
await Promise.all(
  Array.from({ length: workerCount }, async () => {
    while (queue.length) {
      const clip = queue.shift();
      if (!clip) continue;
      const result = await transcribe(clip);
      results.push(result);
      console.log(`${result.id}: ${result.matchesExpected ? 'pass' : 'review'}`);
    }
  }),
);

results.sort((a, b) => a.id.localeCompare(b.id));
const report = {
  batchId: drafts.batchId,
  checkedAt: new Date().toISOString(),
  verifier: 'AvalAI groq.whisper-large-v3-turbo',
  purpose: 'Candidate QA only. A passing transcription does not publish or attach media.',
  total: results.length,
  passed: results.filter((result) => result.matchesExpected).length,
  needsReview: results.filter((result) => !result.matchesExpected),
  results,
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`گزارش: ${reportPath}`);
if (report.needsReview.length) process.exitCode = 2;
