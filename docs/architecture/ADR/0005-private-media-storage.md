# ADR 0005 — Private media storage for controlled alpha

- **Status:** accepted, pending owner account action
- **Date:** 2026-07-28

## Context

The Start A1 candidate set has 60 checksum-recorded local media files. A production attachment
receipt needs stable HTTPS delivery, but the closed alpha must not make learner media publicly
readable or expose a storage credential to the client.

The existing web preview is linked to Vercel project `learnbox-preview`. Vercel Private Blob is
available for the linked project and supports private reads, authenticated delivery and a
project-scoped storage credential.

## Decision

- Use a **private Vercel Blob** store named `learnbox-media-private` for controlled-alpha media.
- Do not create a public Blob store and do not use direct public media URLs.
- Deliver media through authenticated server routes only, with `Cache-Control: private, no-cache`
  for learner media and `X-Content-Type-Options: nosniff`.
- Keep the Blob credential in Vercel's environment store. It must never be copied to chat, Git,
  local committed files or the browser client.
- Upload only after the owner creates the store and explicitly approves the controlled-alpha
  attachment step. Upload verification must compare every stored object against the existing
  60-asset SHA-256 attachment draft before media is attached to a card.

## Consequences

This choice adds one Vercel account action and may have provider costs. It preserves private
delivery, rollback through versioned paths, and the existing media-receipt gate. The local media
preview remains unchanged and production attachment remains blocked until a store is connected.

## Reversal trigger

Re-evaluate if Vercel private storage cannot meet cost, regional, availability, or authenticated
delivery requirements. A provider-neutral receipt format keeps migration to another private
object store possible without changing card identifiers.
