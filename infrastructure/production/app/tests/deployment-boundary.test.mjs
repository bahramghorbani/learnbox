import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appInfrastructure = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(appInfrastructure, '../../..');

function renderedCompose() {
  return JSON.parse(
    execFileSync(
      'docker',
      [
        'compose',
        '--env-file',
        'app.env.example',
        '--file',
        'compose.yaml',
        'config',
        '--format',
        'json',
      ],
      { cwd: appInfrastructure, encoding: 'utf8' },
    ),
  );
}

test('learner app renders as one isolated service on the shared edge network', () => {
  const configuration = renderedCompose();

  assert.deepEqual(Object.keys(configuration.services), ['learner-app']);
  assert.equal(configuration.services['learner-app'].ports, undefined);
  assert.deepEqual(configuration.services['learner-app'].networks, { edge: null });
  assert.equal(configuration.networks.edge.external, true);
  assert.equal(configuration.networks.edge.name, 'learnbox-edge');
});

test('only the learner app receives OTP, database, session and private-media configuration', () => {
  const configuration = renderedCompose();
  const environment = configuration.services['learner-app'].environment;

  assert.equal(environment.NODE_ENV, 'production');
  assert.equal(environment.SMS_IR_ENABLED, 'false');
  assert.equal(environment.SMS_IR_TEMPLATE_ID, '495140');
  assert.equal(environment.SMS_IR_CODE_PARAMETER_NAME, 'OTP');
  assert.equal(environment.LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED, 'false');
  assert.match(environment.DATABASE_URL, /^postgresql:\/\//);
  assert.ok(!JSON.stringify(configuration).includes('learnbox-website'));
});

test('the server app environment file cannot enter source control', () => {
  assert.doesNotThrow(() =>
    execFileSync('git', ['check-ignore', '--quiet', 'infrastructure/production/app/app.env'], {
      cwd: repositoryRoot,
    }),
  );
});
