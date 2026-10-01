import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

test('the Dockerfile guards and links the API migration runner dependencies', () => {
  const dockerfile = readFileSync(resolve(appInfrastructure, 'Dockerfile'), 'utf8');

  assert.match(dockerfile, /test ! -e apps\/api\/node_modules/);
  assert.match(dockerfile, /ln -s \.\.\/website\/node_modules apps\/api\/node_modules/);
  assert.match(dockerfile, /test -e apps\/api\/node_modules\/pg\/package\.json/);
});

test('every LB-B35 CP4/CP5 flag is reachable in the image and defaults to off', () => {
  const configuration = renderedCompose();
  const service = configuration.services['learner-app'];
  for (const flag of [
    'LEARNBOX_TZ_PERSIST',
    'LEARNBOX_QUEUE_QUARANTINE',
    'LEARNBOX_SERVER_SESSION_PLAN',
    'LEARNBOX_BINARY_REVIEW',
    'LEARNBOX_TODAY_WORKLOAD',
  ]) {
    assert.equal(
      service.environment[flag],
      'false',
      `${flag} must be passed to the container, off`,
    );
  }
  // Client flags are inlined at build time: they must be build args, not runtime env.
  for (const flag of [
    'NEXT_PUBLIC_LEARNBOX_QUEUE_QUARANTINE',
    'NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN',
    'NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI',
    'NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED',
  ]) {
    assert.equal(service.build.args[flag], 'false', `${flag} must be a build arg, off`);
    const dockerfile = readFileSync(resolve(appInfrastructure, 'Dockerfile'), 'utf8');
    assert.match(dockerfile, new RegExp(`ARG ${flag}=false`));
    assert.match(dockerfile, new RegExp(`ENV ${flag}=\\$${flag}`));
  }
});
