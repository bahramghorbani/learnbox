# Admin passkey activation

## Current state

The LearnBox admin application (`apps/admin`) carries a complete, disabled-by-default WebAuthn
boundary for a single owner. No passkey is enrolled, the admin app is not deployed, no DNS is
configured and no production secret exists. Everything remains behind the exact
`LEARNBOX_ADMIN_PASSKEY_ENABLED=true` gate; the UI stays a local prototype until
`NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=true` is set on the server that serves it.

The boundary stores only keyed hashes: challenge hashes, browser-nonce hashes, session token
hashes and CSRF hashes. Raw challenges, secrets, tokens, public keys, cookies, IP addresses and
user agents never enter PostgreSQL or logs. Bootstrap additionally requires
`LEARNBOX_ADMIN_BOOTSTRAP_ENABLED=true` and a one-time `LEARNBOX_ADMIN_BOOTSTRAP_SECRET` of at
least 32 bytes, and closes permanently once the first active credential exists.

## Activation procedure (owner-approved)

1. Confirm the owner approves activating the admin passkey boundary and that the admin app will
   be served over an exact HTTPS origin.
2. In the deployment secret store only, set:
   - `LEARNBOX_ADMIN_ORIGIN` to the exact HTTPS origin, for example `https://admin.example.com`.
   - `LEARNBOX_ADMIN_RP_ID` to that origin's hostname (must match exactly).
   - `LEARNBOX_ADMIN_TOKEN_HASH_KEY` to a new random value of at least 32 bytes.
3. For the first enrollment only, also set `LEARNBOX_ADMIN_BOOTSTRAP_ENABLED=true` and
   `LEARNBOX_ADMIN_BOOTSTRAP_SECRET` to a new one-time random value of at least 32 bytes.
4. Set `LEARNBOX_ADMIN_PASSKEY_ENABLED=true` (and `NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED`
   for the admin UI) and redeploy the admin application.
5. On the admin origin, complete the bootstrap ceremony (the browser shows the enrollment flow
   only while the bootstrap flag and secret are present). The first verified registration creates
   the singleton owner and its first passkey; the bootstrap route then returns 404 permanently.
6. Immediately remove the bootstrap secret and set `LEARNBOX_ADMIN_BOOTSTRAP_ENABLED=false`.
   Additional passkeys attach to the existing owner and never create a second administrator.

## Rollback

Setting `LEARNBOX_ADMIN_PASSKEY_ENABLED=false` (and the UI flag false) and redeploying returns
every auth route to `404` and the UI to the local prototype. Sessions and challenges are already
server-side hashes only; revocation is immediate and requires no client state.
