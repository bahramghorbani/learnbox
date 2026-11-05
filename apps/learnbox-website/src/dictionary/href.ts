// NFC so every link, canonical URL and sitemap entry has one spelling, even for headwords the
// source data stores decomposed (e.g. "a" + combining umlaut).
export const wordHref = (lemma: string) =>
  `/dictionary/${encodeURIComponent(lemma.normalize('NFC'))}`;
