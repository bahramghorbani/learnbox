import { readFile, writeFile } from 'node:fs/promises';

import { buildMobileStartContent } from './mobile-start-content.mjs';

const sourceFile = new URL(
  '../content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json',
  import.meta.url,
);
const outputFile = new URL('../apps/mobile/assets/content/start-a1-v1.json', import.meta.url);
const generated = `${JSON.stringify(buildMobileStartContent(JSON.parse(await readFile(sourceFile, 'utf8'))), null, 2)}\n`;

if (process.argv.includes('--check')) {
  const committed = await readFile(outputFile, 'utf8');
  if (committed !== generated) {
    throw new Error(
      'Mobile Start content is out of sync. Run node scripts/sync-mobile-start-content.mjs.',
    );
  }
  console.log('Mobile Start content matches its canonical source.');
} else {
  await writeFile(outputFile, generated);
  console.log('Mobile Start content synchronized.');
}
