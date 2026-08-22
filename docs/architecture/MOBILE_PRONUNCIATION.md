# Mobile offline pronunciation

The native review flow can play only the six already-approved Start Pack V2 clips. Flutter resolves
the word and sentence paths from `StartPackAudioAssets` and sends one local asset path through the
`learnbox/pronunciation_v2` method channel. No URL, download, cache, provider or network path exists.

`PronunciationPlayer` is injected from the app boundary so widget tests use a deterministic fake.
Production uses `MethodChannelPronunciationPlayer`. Android and iOS enforce the same exact six-path
allowlist before opening a packaged Flutter asset with their platform media APIs. A new play request
replaces the previous player; grading and screen disposal request cleanup without allowing playback
failure to block durable review persistence.

The word control is visible for a canonical card. The sentence control appears only after answer
reveal. Both have Persian accessibility labels and 56 logical-pixel targets. Playback never starts
automatically. Platform failures leave the card and grading controls usable and announce
`پخش صدا انجام نشد؛ دوباره تلاش کن.` as a live-region message.

This boundary adds no dependency, content, asset, storage, sync, identity, release flag, production
service or Bobo change. Emulator smoke and physical Android listening QA for all six clips remain
required before merge; source and widget tests are not listening evidence.
