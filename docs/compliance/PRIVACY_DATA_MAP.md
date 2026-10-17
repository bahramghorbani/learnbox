# Privacy data map

Sensitive data: phone E.164, authentication/session metadata, learning history, personal-card free text, and purchases. Minimize collection, encrypt in transit/at rest, restrict admin access, and define retention before production.

## Purchase evidence after account deletion

Owner product decision (2026-10-17). It is not legal advice, and possible legal requirements must
be checked separately before launch.

- Kept for **5 years from account deletion** in `purchase_ownership_claims`. `retain_until` is
  written in the deletion transaction (`now() + 5 years`).
- Fields: `provider`, Authority (`provider_purchase_id`), RefID (`provider_reference`), `pack_id`,
  `amount_tomans`, `status`, `purchased_at`, `recorded_at`, `entitlement_keys`, `subject_hash`,
  `retain_until`, `preserved_by_deletion_id`, `id`. Profile, sessions, phone, name, learning data,
  card data and gateway bodies are not kept.
- Classification: **pseudonymous personal data**, not anonymous. Authority and RefID link to the
  gateway's payer records. `subject_hash` is a keyed phone hash and can be re-identified by whoever
  holds the key; when no phone was on file it embeds the former user id.
- After expiry nothing is deleted automatically. The manual purge procedure and the backup caveat are
  in `docs/architecture/COMMERCE_CORE_CONTRACT.md` §10.3.
