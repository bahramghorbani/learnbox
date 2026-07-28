# Media worker

Validates the receipt of versioned image/audio derivatives against an approved media plan. It does
not generate, attach or publish assets. A receipt needs a matching content ID, versioned storage
key, HTTPS URL, suitable MIME type, SHA-256 checksum and explicit QA approval before it is merely
eligible for a later attachment decision.
