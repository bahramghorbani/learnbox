# Mobile offline learner shell

The Flutter app uses one `LearnerHomeShell` to own the selected Today, Words or Progress destination.
The shell passes the same `StartPackRepository`, `ReviewQueue` and `PronunciationPlayer` instances;
navigation changes local presentation only and never invokes sync, identity, HTTP or a provider.

- **Today** retains its existing repository states, review route, durable grading and completion flow.
- **Words** reads the canonical bundled session and shows exactly the three Start cards in order,
  with approved images, German phrases isolated LTR and Persian meanings. It has no editable or
  owned-vocabulary claim.
- **Progress** reads only `ReviewQueue.pendingCount()` and labels the result as answers stored on
  this device. It exposes no upload or sync action; `شروع مرور` returns to Today.

All three destinations use the existing LearnBox tokens and persistent semantic bottom navigation.
Review and completion remain focused routes outside that navigation. Loading, empty and local-error
states are truthful and retryable. Narrow, landscape and enlarged-text widget coverage protects the
RTL/LTR layout.

This boundary adds no dependency, asset, network, storage implementation, identity, provider,
release flag, production behavior or Bobo change. The separate physical Android secure-storage
finding is tracked in GitHub issue #92 and is neither fixed nor masked here.
