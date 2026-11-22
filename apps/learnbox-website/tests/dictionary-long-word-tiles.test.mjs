import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const client = readFileSync(join(appRoot, 'app/dictionary/client.tsx'), 'utf8');
const css = readFileSync(join(appRoot, 'app/dictionary/dictionary.css'), 'utf8');

test('long dictionary lemmas use shrinking desktop tiles and wrapping mobile tiles', () => {
  assert.match(client, /tiles\.length > 8 \? ' compact' : ''/);
  assert.match(css, /\.tiles\.compact \{\s*flex: 1 1 0;\s*min-width: 0;/);
  assert.match(
    css,
    /\.tiles\.compact \.tile \{\s*box-sizing: border-box;\s*flex: 1 1 0;\s*min-width: 0;/,
  );
  assert.match(css, /\.tiles\.compact \{\s*flex-basis: 100%;\s*flex-wrap: wrap;/);
});
