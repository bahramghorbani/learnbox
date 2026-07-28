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
  candidateMedia: {
    image: string;
    wordAudio: string;
    sentenceAudio: string;
  };
};

export const stagedStartSlice: StartSliceItem[] = startA1DraftsJson.items.map((item) => ({
  id: item.id,
  article: item.article ?? '',
  german: item.lemma,
  germanDefinition: item.simpleGermanDefinition,
  persian: item.persianMeanings[0],
  exampleGerman: item.examples[0].german,
  examplePersian: item.examples[0].persian,
  candidateMedia: {
    image: `/api/local-preview-media/${item.id}/image`,
    wordAudio: `/api/local-preview-media/${item.id}/word-audio`,
    sentenceAudio: `/api/local-preview-media/${item.id}/sentence-audio`,
  },
}));

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
