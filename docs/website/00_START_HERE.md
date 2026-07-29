# LearnBox Website — Start Here

This documentation pack is the execution brief for Codex to build the official LearnBox marketing website and landing experience inside the existing LearnBox repository.

## First instruction

Before writing code, inspect the entire repository.

Do not create a new repository.

Do not rebuild anything that already exists.

Use this rule:

> DO NOT REBUILD WHAT ALREADY EXISTS. UNDERSTAND IT. VALIDATE IT. EXTEND IT.

## Required repository behavior

1. Inspect the current repository structure.
2. Identify whether the repository already contains:
   - a website or landing project,
   - shared UI components,
   - design tokens,
   - motion utilities,
   - branding assets,
   - BuBu assets or documentation,
   - theme infrastructure,
   - deployment configuration.
3. Reuse compatible existing work.
4. Do not overwrite existing BuBu files or recreate BuBu if a valid implementation already exists.
5. Add DuDu only when missing, using the supplied approved reference image.
6. Build the LearnBox website as a formal subproject of the existing LearnBox repository.
7. Do not create a separate repository unless the user explicitly changes this rule.

## Preferred location

Choose the best location based on the existing repository.

Preferred examples:

```text
apps/learnbox-website/
```

or:

```text
website/
```

or another structure already established by the repository.

Do not impose a monorepo migration if the current project does not need it.

## Mission

Build a polished, cinematic, motion-rich Persian landing page for LearnBox.

The website is not:

- the LearnBox admin panel,
- the app management interface,
- the learning web app,
- a dashboard,
- a generic template.

It is the public product website and brand experience.

## Product distribution represented on the website

The website must clearly present:

- Android download through Café Bazaar,
- the web app for iPhone, iPad, and other supported devices,
- social channels including Telegram, Instagram, LinkedIn, and Pinterest,
- accurate release status for each platform.

Never imply that an App Store native iOS application exists if it does not.

## Codex autonomy

Codex is the primary technical executor.

It should independently:

- inspect the repository,
- choose reversible technical solutions,
- build the project,
- install dependencies,
- create components,
- implement animations,
- run tests,
- fix errors,
- prepare deployment,
- document changes,
- continue to the next project phase.

Only involve the user for unavoidable actions such as credentials, account access, payment, DNS changes, sensitive secrets, or irreversible public actions.

When user action is required, give simple numbered instructions suitable for a non-technical user.

## Finish condition

The project is not complete when the first page renders.

The project is complete only when:

- the approved storyboard is implemented,
- mobile and desktop experiences are finished,
- links and distribution paths are correct,
- accessibility and reduced motion are supported,
- production deployment is verified,
- theme switching works,
- documentation is updated,
- known critical bugs are resolved,
- the project state reads `VERSION 1.0 — COMPLETE`.

Start by reading every file in this folder.
