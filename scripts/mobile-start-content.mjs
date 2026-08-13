const dailySessionIds = ['start-a1-haus', 'start-a1-tisch', 'start-a1-tuer'];

export function buildMobileStartContent(source) {
  if (!source || !Array.isArray(source.items)) {
    throw new TypeError('Canonical Start content must contain an items array.');
  }

  const itemsById = new Map(source.items.map((item) => [item?.id, item]));

  return {
    cards: dailySessionIds.map((id) => projectCard(itemsById.get(id), id)),
  };
}

function projectCard(item, id) {
  if (!item) {
    throw new Error(`Canonical Start content is missing ${id}.`);
  }

  const { article, lemma, persianMeanings, simpleGermanDefinition, examples } = item;
  const example = examples?.[0];
  if (
    !isNonEmptyString(article) ||
    !isNonEmptyString(lemma) ||
    !Array.isArray(persianMeanings) ||
    !isNonEmptyString(persianMeanings[0]) ||
    !isNonEmptyString(simpleGermanDefinition) ||
    !example ||
    !isNonEmptyString(example.german) ||
    !isNonEmptyString(example.persian)
  ) {
    throw new Error(`Canonical Start content has malformed required fields for ${id}.`);
  }

  return {
    id,
    german: `${article} ${lemma}`,
    persian: persianMeanings[0],
    definition: simpleGermanDefinition,
    example: { german: example.german, persian: example.persian },
    imageAsset: `assets/cards/${id}.png`,
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}
