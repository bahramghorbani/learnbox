# LB-DS-020 / Preview auth runtime handoff

- Branch: `worker/lb-ds-020-preview-auth-runtime`
- Base commit: `8667cab`
- Head commit: pending at commit time
- Draft PR: pending at push time
- Status: review_requested
- Scope completed: fail-closed native Preview auth runtime composition; secure installation ID; dart:io HTTPS JSON transport; build-time exact Preview origin gate; `main.dart` composes the auth screen only when both explicit compile-time gates validate
- Files changed: `apps/mobile/lib/main.dart`, `apps/mobile/lib/features/identity/mobile_installation_id_store.dart`, `apps/mobile/lib/features/identity/mobile_auth_http_transport.dart`, `apps/mobile/lib/features/identity/mobile_preview_auth_runtime.dart`, `apps/mobile/test/mobile_preview_auth_runtime_test.dart`, `apps/mobile/README.md`, `.ai/WORK_QUEUE.md`, `CURRENT_WORK.md`, `.ai/worker-reports/LB-DS-020.md`
- Checks run: focused runtime tests `+4`; full Flutter suite `+131`; `flutter analyze`; Dart format; `pnpm check`; `pnpm build`; migration validation; queue/continuity validators; `git diff --check`
- Checks unavailable: `flutter build apk --debug` blocked by HTTP 403 while downloading Flutter engine artifacts from `storage.googleapis.com`
- Remaining work: independent security review, CI review, then owner-controlled one-device Preview run only after an explicitly configured build; enter phone/OTP only on the device; rollback Preview flags after verification
- Risks: native client must be built only with the owner-approved Preview origin; Vercel SSO protection must remain compatible with native verification; no review-sync path is enabled
- Secrets or production changes: no API key, SMS credential, OTP, phone, token, response body or secret was added to source, fixtures, logs or report; no Preview flag is currently enabled; no Production change
- Bobo canonical status: no Bobo asset was changed, added or composed
