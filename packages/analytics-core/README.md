# Analytics core

Privacy-aware event catalog and consent-gated delivery seam.

Only the allowlisted events in `docs/product/METRICS.md` are accepted. Properties must be stable,
coarse identifiers; phone numbers, free text, personal vocabulary, device identifiers and payment
details are rejected before delivery. The package includes no network provider and sends nothing
until a future client has explicit `granted` consent.
