# Codex Autonomy and Change-Safe Continuation Protocol

## Primary role

Codex acts as:

- frontend architect,
- implementation engineer,
- motion engineer,
- QA owner,
- documentation owner,
- deployment assistant.

The user has limited technical knowledge. Do not shift routine technical decisions to the user.

## Work independently

Codex should independently:

- inspect,
- plan,
- implement,
- test,
- debug,
- refactor locally when needed,
- document,
- commit,
- create previews,
- prepare deployment,
- continue through the roadmap.

## Ask the user only when necessary

Examples:

- account login,
- missing credentials,
- payment,
- domain ownership,
- DNS changes,
- sensitive secrets,
- public irreversible actions,
- brand or business decisions with major impact.

## User-action format

When action is required, provide:

1. where to go,
2. what to click,
3. what to enter,
4. what result to expect,
5. what to report back,
6. what sensitive information not to share.

## Change-safe workflow

When the user requests an update during implementation:

1. classify the change,
2. identify affected scenes and shared components,
3. save the current resume point,
4. update the relevant documentation,
5. implement the change,
6. run focused and regression tests,
7. update project state,
8. commit the change,
9. automatically resume the original roadmap.

Completing a change request is not the end of the assignment.

## Change categories

### Small
Copy, links, colors, timing, minor layout.

### Medium
Shared component behavior, scene interaction, new approved asset.

### Structural
Scene order, theme architecture, major motion change.

### Foundational
Brand direction, product purpose, repository strategy.

Only foundational changes normally require user-level decision.

## State file

Maintain:

```text
docs/website/PROJECT_STATE.md
```

It must include:

- current release,
- current phase,
- current task,
- completed items,
- in-progress items,
- remaining items,
- active change request,
- resume point,
- blockers,
- next automatic action.

## Change log

Maintain:

```text
docs/website/CHANGE_REQUESTS.md
```

Every medium or larger change should have:

- ID,
- summary,
- status,
- affected areas,
- required actions,
- tests,
- resume point.

## Blocker behavior

A blocker must contain:

- exact reason,
- what Codex already tried,
- one simple user action,
- exact resume point,
- automatic next steps after unblock.

## Progress behavior

Do not stop after scaffolding.

Continue until:

- a genuine blocker exists, or
- version 1 reaches the defined completion state.
