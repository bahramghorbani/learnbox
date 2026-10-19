# Admin session policy

- A successful Passkey verification permits ordinary Admin work for 60 minutes: session idle timeout and the separate operational-auth window are both 60 minutes.
- Sensitive actions retain a 5-minute fresh-auth window: administrator access, Passkey enrollment, payment settings, price/store controls, and publish/archive lifecycle actions.
- Logout, revocation, CSRF validation, role checks, and the eight-hour absolute session expiry are unchanged.
- Requests may refresh idle activity but never refresh the operational or sensitive-auth timestamps; polling therefore cannot extend either window indefinitely.
- Ordinary draft-content work, media state/generation, and AI draft generation use the operational window. A re-authenticated retry keeps browser form state; it does not create or accept content automatically.
