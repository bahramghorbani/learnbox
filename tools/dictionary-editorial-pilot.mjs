import { createHash } from 'node:crypto';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function pilotRecords(input) {
  const items = Array.isArray(input) ? input : input?.items;
  if (!Array.isArray(items) || items.length === 0)
    throw new Error('Pilot JSON must be a non-empty array or {"items":[...]}.');
  return items.map((item, index) => {
    if (
      !object(item) ||
      typeof item.dictionaryKey !== 'string' ||
      !item.dictionaryKey.trim() ||
      !object(item.aiPayload) ||
      typeof item.source !== 'string' ||
      !item.source.trim() ||
      (item.model !== undefined && typeof item.model !== 'string') ||
      (item.costMetadata !== undefined && !object(item.costMetadata))
    )
      throw new Error(`Invalid pilot item at index ${index}.`);
    return {
      dictionaryKey: item.dictionaryKey.trim(),
      aiPayload: item.aiPayload,
      source: item.source.trim(),
      model: item.model ?? null,
      costMetadata: item.costMetadata ?? {},
    };
  });
}

export function idempotencyKey(record) {
  const hash = createHash('sha256').update(JSON.stringify(record)).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${((Number.parseInt(hash[16], 16) & 3) | 8).toString(16)}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function releaseInput(items) {
  return {
    entries: items
      .filter((item) => item.status === 'approved')
      .map((item) => ({
        dictionaryKey: item.dictionaryKey,
        payload: item.manualPayload ?? item.aiPayload,
      })),
  };
}
