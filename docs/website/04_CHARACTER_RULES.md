# Official Character Rules

## Names

The official English spellings are:

- `BuBu`
- `DuDu`

Do not use Bobo, Dodo, Bubu, Dudu, or other spellings in production brand documentation unless quoting legacy material.

## BuBu

BuBu is the main LearnBox character.

Core visual identity:

- purple clothing or hoodie,
- rounded friendly body,
- soft 3D material,
- short rounded ears,
- warm smile,
- approachable expression,
- established LearnBox proportions and face.

Role:

- guide,
- mentor,
- learning companion,
- primary storyteller.

## DuDu

DuDu is the official secondary character.

DuDu must retain the approved reference appearance:

- yellow hoodie and yellow visual identity,
- exact face style,
- exact body proportions,
- approved hair tuft,
- approved backpack styling,
- soft 3D material,
- friendly, energetic personality.

Role:

- motivator,
- daily-practice companion,
- energetic secondary character.

## Repository protection rule

Before creating character assets, inspect the repository.

If BuBu already exists:

- do not recreate BuBu,
- do not overwrite BuBu,
- do not rename BuBu directories,
- do not generate a second character guide,
- treat the current validated repository version as the source of truth.

If DuDu already exists:

- validate it against the supplied reference,
- keep it if consistent,
- extend rather than duplicate.

If DuDu is missing:

- add DuDu using the supplied official reference,
- copy the reference image into the repository,
- do not regenerate the canonical reference image.

## Character usage rule

Do not insert both characters everywhere.

Use BuBu as the default lead.

Use DuDu only when:

- the storyboard explicitly calls for DuDu,
- the user asks for DuDu,
- a future approved content specification requires DuDu.

## Seasonal rule

Seasonal themes may change:

- accessories,
- small outfit details,
- background,
- props,
- lighting,
- particles.

Seasonal themes must not change:

- face,
- body proportions,
- silhouette,
- identity colors,
- eye design,
- character personality.

## Suggested repository structure

```text
branding/characters/
├── BuBu/
│   └── existing validated content
└── DuDu/
    ├── references/
    │   └── dudu-official-reference-v1.jpeg
    ├── DUDU_CHARACTER_GUIDE.md
    └── README.md
```
