import startA1CatalogJson from '../../../content/packs/learnbox-start/vocabulary/start-a1-catalog-35-pending-drafts.json';
import startA1DraftsJson from '../../../content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json';

export const startSliceBatchId = startA1DraftsJson.batchId;
export const dailySessionSize = 3;

export type StartSliceItem = {
  id: string;
  article: string;
  german: string;
  germanDefinition: string;
  persian: string;
  exampleGerman: string;
  examplePersian: string;
};

export const stagedStartSlice: StartSliceItem[] = startA1DraftsJson.items.map(toStartSliceItem);

const allStartItems = new Map(
  [...startA1DraftsJson.items, ...startA1CatalogJson.items].map((item) => [
    item.id,
    toStartSliceItem(item),
  ]),
);

function toStartSliceItem(item: (typeof startA1DraftsJson.items)[number]): StartSliceItem {
  return {
    id: item.id,
    article: item.article ?? '',
    german: item.lemma,
    germanDefinition: item.simpleGermanDefinition,
    persian: item.persianMeanings[0],
    exampleGerman: item.examples[0].german,
    examplePersian: item.examples[0].persian,
  };
}

/** Returns only canonical bundled Start content; unknown server IDs never fall back to another word. */
export function resolveStartSliceItem(contentId: string): StartSliceItem | undefined {
  return allStartItems.get(contentId);
}

export function selectTodayStartSession(day: Date = new Date()): StartSliceItem[] {
  const dayNumber = Math.floor(
    Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86_400_000,
  );
  const firstIndex = (dayNumber * dailySessionSize) % stagedStartSlice.length;

  return Array.from(
    { length: dailySessionSize },
    (_, offset) => stagedStartSlice[(firstIndex + offset) % stagedStartSlice.length],
  );
}
