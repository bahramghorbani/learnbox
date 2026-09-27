# Local runbook

1. Install Flutter stable from the official Flutter SDK when mobile work starts; verify with `flutter doctor`.
2. Copy `.env.example` to `.env`; do not use development OTP mode outside local development.
3. Start supporting services with `docker compose up -d`.
4. Run `pnpm install && pnpm check`.

Do not deploy, buy infrastructure, or configure production credentials from this runbook.
