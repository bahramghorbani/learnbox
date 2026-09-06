# Admin passkey activation

## Current state

The LearnBox admin application (`apps/admin`) carries a complete, disabled-by-default WebAuthn
boundary for a single owner. The owner Passkey, canonical-user binding and `super_admin` role are
verified on the isolated Admin staging origin; bootstrap is closed there. Production activation,
DNS, credentials and deployment remain unchanged and separately owner-gated. Everything remains
behind the exact `LEARNBOX_ADMIN_PASSKEY_ENABLED=true` runtime gate. The public UI flag
`NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=true` must also be supplied while building the
Next.js image because `NEXT_PUBLIC_*` values are compiled into the browser bundle; setting it only
at container runtime does not enable the Passkey gate in the built UI.

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
4. Set `NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=true` for the Docker **build**, build an
   immutable candidate image, and verify that the unauthenticated candidate shows the Passkey login
   rather than the local workspace. Keep `LEARNBOX_ADMIN_PASSKEY_ENABLED=true` as a runtime-only
   server gate. Never pass `LEARNBOX_ADMIN_TOKEN_HASH_KEY`, `LEARNBOX_ADMIN_BOOTSTRAP_SECRET`,
   `DATABASE_URL` or other server credentials as Docker build arguments.
5. Deploy the verified candidate to the approved isolated environment. Supplying the public UI
   flag only in the runtime environment is insufficient and must be treated as a failed candidate.
6. On the admin origin, complete the bootstrap ceremony (the browser shows the enrollment flow
   only while the bootstrap flag and secret are present). The first verified registration creates
   the singleton owner and its first passkey; the bootstrap route then returns 404 permanently.
7. Immediately remove the bootstrap secret and set `LEARNBOX_ADMIN_BOOTSTRAP_ENABLED=false`.
   Additional passkeys attach to the existing owner and never create a second administrator.

## Rollback

Setting `LEARNBOX_ADMIN_PASSKEY_ENABLED=false`, rebuilding with the public UI flag false and
redeploying returns every auth route to `404` and the UI to the local prototype. Sessions and
challenges are already server-side hashes only; revocation is immediate and requires no client
state.
