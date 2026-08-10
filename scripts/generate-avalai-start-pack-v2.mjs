import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const outputDirectory = '/Users/test/.codex/tmp/learnbox-avalai/start-pack-v2/images';
const ids = process.argv.slice(2);
const keyLine = existsSync('.env.avalai.local')
  ? readFileSync('.env.avalai.local', 'utf8')
      .split(/\r?\n/)
      .find((line) => line.startsWith('AVALAI_API_KEY='))
  : undefined;
const apiKey =
  process.env.AVALAI_API_KEY?.trim() ?? keyLine?.slice('AVALAI_API_KEY='.length).trim();
if (!apiKey) throw new Error('کلید AvalAI وارد نشده است.');
const contract = JSON.parse(
  readFileSync('content/packs/learnbox-start/prompts/start-a1-v2-visual-contract.json', 'utf8'),
);
const cards = ids.length
  ? contract.cards.filter((card) => ids.includes(card.contentId))
  : contract.cards;
if (!cards.length || (ids.length && cards.length !== ids.length)) {
  throw new Error('شناسهٔ کارت V2 معتبر نیست.');
}
mkdirSync(outputDirectory, { recursive: true });
const results = [];
async function generate(card) {
  const response = await fetch('https://api.avalai.ir/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: contract.model,
      prompt: `${card.brief} ${contract.style}`,
      size: '1024x1024',
      n: 1,
      response_format: 'b64_json',
    }),
  });
  if (!response.ok) throw new Error(`${card.contentId}: HTTP ${response.status}`);
  const payload = await response.json();
  const item = payload?.data?.[0];
  const bytes =
    typeof item?.b64_json === 'string'
      ? Buffer.from(item.b64_json, 'base64')
      : typeof item?.url === 'string'
        ? Buffer.from(await (await fetch(item.url)).arrayBuffer())
        : undefined;
  if (!bytes?.length) throw new Error(`${card.contentId}: پاسخ تصویری قابل ذخیره نیست.`);
  const filename = `${card.contentId}-image-v2-candidate.png`;
  writeFileSync(`${outputDirectory}/${filename}`, bytes);
  results.push({
    contentId: card.contentId,
    filename,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    estimatedCost: payload?.estimated_cost?.unit ?? null,
  });
}
const queue = [...cards];
await Promise.all(
  Array.from({ length: Math.min(2, queue.length) }, async () => {
    while (queue.length) {
      const card = queue.shift();
      if (card) await generate(card);
    }
  }),
);
results.sort((a, b) => a.contentId.localeCompare(b.contentId));
writeFileSync(
  `${outputDirectory}/manifest.json`,
  `${JSON.stringify({ version: 'v2', model: contract.model, status: 'candidate_qa_pending', publicationBlocked: true, results }, null, 2)}\n`,
);
console.log(`تولید محلی V2 برای ${results.length} کارت تمام شد.`);
