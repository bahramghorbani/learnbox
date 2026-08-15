/**
 * Shared audio-phrase builder for AvalAI Start-pack audio.
 *
 * Issue #59 requires every native word-pronunciation asset to be produced and
 * reviewed as the exact displayed German lexical phrase, including its article
 * where displayed (for example `das Haus`). Word audio must therefore be the
 * `article + lemma` combination for nouns, and the bare lemma (or expression)
 * otherwise — not the bare lemma, which previously produced an English-like
 * `house` without the displayed article.
 */

/**
 * Returns the exact German phrase a learner sees in the UI for a vocabulary
 * item. For nouns this is `article + lemma` (for example `das Haus`); for
 * verbs, adjectives and phrases it is the lemma or expression unchanged.
 */
export function wordPhrase(item) {
  const article = item.article?.trim();
  return article ? `${article} ${item.lemma}` : item.lemma;
}
