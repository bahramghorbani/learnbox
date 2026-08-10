import { readFile } from 'node:fs/promises';

const contract = JSON.parse(
  await readFile('content/packs/learnbox-start/prompts/start-a1-v2-visual-contract.json', 'utf8'),
);
const drafts = JSON.parse(
  await readFile(
    'content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json',
    'utf8',
  ),
);
const forbiddenBrief = /bobo/i;
const ids = contract.cards.map((card) => card.contentId);
const expectedIds = drafts.items.map((item) => item.id);
if (contract.version !== 'v2' || contract.model !== 'flux.2-pro') {
  throw new Error('قرارداد V2 مدل یا نسخهٔ معتبر ندارد.');
}
if (ids.length !== expectedIds.length || new Set(ids).size !== ids.length) {
  throw new Error('قرارداد V2 باید دقیقاً یک دستور یکتا برای هر کارت داشته باشد.');
}
for (const id of expectedIds) {
  if (!ids.includes(id)) throw new Error(`دستور V2 برای ${id} وجود ندارد.`);
}
for (const card of contract.cards) {
  if (typeof card.brief !== 'string' || card.brief.length < 32 || forbiddenBrief.test(card.brief)) {
    throw new Error(`دستور ${card.contentId} معتبر یا مستقل از ممنوعیت‌ها نیست.`);
  }
}
if (!/no text/i.test(contract.style) || !/no.*Bobo/i.test(contract.style)) {
  throw new Error('قواعد مشترک باید ممنوعیت متن و بوبوی تولیدشده را صریح نگه دارند.');
}
console.log(`قرارداد تصویری V2 برای ${ids.length} کارت معتبر است.`);
