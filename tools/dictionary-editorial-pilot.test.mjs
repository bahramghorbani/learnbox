import test from 'node:test';
import assert from 'node:assert/strict';

import { idempotencyKey, pilotRecords, releaseInput } from './dictionary-editorial-pilot.mjs';

const record = {
  dictionaryKey: 'Haus',
  aiPayload: { gloss: 'خانه' },
  source: 'completed-ai-pilot',
};

test('pilot importer accepts only queued-record input and produces repeat-safe UUID keys', () => {
  const [parsed] = pilotRecords({ items: [record] });
  assert.equal(parsed.dictionaryKey, 'Haus');
  assert.match(
    idempotencyKey(parsed),
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(idempotencyKey(parsed), idempotencyKey(parsed));
  assert.throws(() =>
    pilotRecords({ items: [{ dictionaryKey: 'x', aiPayload: [], source: 'ai' }] }),
  );
});

test('release exporter includes approved effective payloads only', () => {
  assert.deepEqual(
    releaseInput([
      { ...record, status: 'queued', manualPayload: null },
      { ...record, dictionaryKey: 'Baum', status: 'approved', manualPayload: { gloss: 'درخت' } },
      { ...record, dictionaryKey: 'alt', status: 'deleted', manualPayload: null },
    ]),
    { entries: [{ dictionaryKey: 'Baum', payload: { gloss: 'درخت' } }] },
  );
});
