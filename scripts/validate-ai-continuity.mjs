import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const requiredFiles = [
  'AI_BOOTSTRAP.md',
  'AI_HANDOFF.md',
  'PROJECT_STATE.md',
  'CURRENT_WORK.md',
  '.ai/manifest.yaml',
  '.ai/capabilities.yaml',
  '.ai/skills.lock.yaml',
  '.ai/provider-mappings.yaml',
];

const requiredReferences = {
  'AI_BOOTSTRAP.md': [
    'AGENTS.md',
    'PROJECT_STATE.md',
    'docs/storyboard/STATUS.md',
    'CURRENT_WORK.md',
  ],
  'PROJECT_STATE.md': ['docs/product/MASTER_SPEC.md', 'PDR-003'],
  'AGENTS.md': ['AI_BOOTSTRAP.md', 'PROJECT_STATE.md', 'CURRENT_WORK.md'],
  '.github/PULL_REQUEST_TEMPLATE.md': [
    'PROJECT_STATE.md',
    'CURRENT_WORK.md',
    'Bobo canonical status',
  ],
};

const root = process.cwd();
const missing = [];

for (const file of requiredFiles) {
  try {
    await access(resolve(root, file));
  } catch {
    missing.push(file);
  }
}

if (missing.length > 0) {
  throw new Error(`AI continuity files missing: ${missing.join(', ')}`);
}

for (const [file, references] of Object.entries(requiredReferences)) {
  const content = await readFile(resolve(root, file), 'utf8');
  const absent = references.filter((reference) => !content.includes(reference));
  if (absent.length > 0) {
    throw new Error(`${file} is missing continuity references: ${absent.join(', ')}`);
  }
}

const skillsLock = await readFile(resolve(root, '.ai/skills.lock.yaml'), 'utf8');
for (const forbidden of ['codex-', 'claude-', 'plugin:', 'skill:']) {
  if (skillsLock.toLowerCase().includes(forbidden)) {
    throw new Error(`.ai/skills.lock.yaml must remain capability-based, found ${forbidden}`);
  }
}

console.log('AI_CONTINUITY_OK');
