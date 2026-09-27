# Billing core

Provider-neutral entitlement and purchase-verification boundary. No live providers or credentials are configured in foundation.

The catalog contains only LearnBox product and entitlement IDs, never provider-specific SKU IDs or prices. Entitlements resolve only from server-verified purchases; revoked, refunded, inactive and expired purchases grant nothing. Sandbox and production are explicit and cannot be mixed accidentally.
