import { readFile } from 'node:fs/promises';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const drafts = JSON.parse(
  await readFile(new URL('vocabulary/start-a1-vertical-slice-drafts.json', contentRoot), 'utf8'),
);
const qa = JSON.parse(
  await readFile(new URL('validation/start-a1-candidate-qa.json', contentRoot), 'utf8'),
);

if (qa.batchId !== drafts.batchId || qa.status !== 'candidate_qa_complete_not_released') {
  throw new Error('Candidate QA must apply to the active unreleased Start batch.');
}

for (const dimension of ['provenance', 'visual', 'audio', 'app_flow']) {
  if (qa.checks[dimension]?.outcome !== 'passed_for_candidate_stage') {
    throw new Error(`Candidate QA must include a passing ${dimension} check.`);
  }
}

if (
  !qa.publicationBlocked ||
  !qa.remainingReleaseGates.includes('owner_release_approval') ||
  !qa.remainingReleaseGates.includes('participant_invitation_approval')
) {
  throw new Error('Candidate QA must retain owner and participant release gates.');
}

console.info('Start A1 candidate QA is complete and remains publication-blocked.');
