/// Build-time gate for the native binary review interaction (CP16 / Decision A).
library;

import 'package:flutter/foundation.dart';

/// Mirrors Web's `NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI`. Default **off**: a build
/// that does not pass the define keeps the historical four-grade interaction, so
/// the migration is independently deployable and reversible by rebuild.
///
/// This gate controls the learner-facing interaction **only**. It does not enable
/// Scheduler V2 and has no relationship to `LEARNBOX_SCHEDULER_V2`, which stays
/// absent; the server decides scheduling independently of which buttons shipped.
class BinaryReviewUiConfig {
  const BinaryReviewUiConfig._();

  static const _define =
      String.fromEnvironment('LEARNBOX_MOBILE_BINARY_REVIEW_UI');

  /// True only for an exact `true`, so a typo fails safe to four grades.
  static bool get enabled => _define == 'true';
}

/// CP17 F2 — runtime kill switch for the binary review interaction.
///
/// [BinaryReviewUiConfig] alone is compile-time, so once a binary-capable build
/// is distributed the only way to withdraw the feature is a store rebuild and
/// review cycle. That is not an adequate emergency control. This adds a
/// server-advertised runtime override, deliberately kept to the smallest shape
/// that gives real operational rollback: no remote-config system and no new
/// endpoint, just two booleans carried on the review-sync response the client
/// already performs.
///
/// The two signals are **separate on purpose**, because conflating them is what
/// turns a kill switch into data loss:
///
/// * [creationEnabled] — may the client OFFER the binary interaction and create
///   new binary events? Turning this off is the kill switch: it stops the
///   feature spreading immediately, on the next sync, with no rebuild.
/// * [acceptanceEnabled] — will the server still ACCEPT binary events already
///   queued on devices? This must stay **on** while any device may still hold
///   binary events, so existing queues can drain. Withdrawing acceptance while
///   binary events are outstanding converts real learner reviews into
///   retry-forever traffic.
///
/// The safe emergency sequence is therefore: creation off, acceptance stays on,
/// let the queues drain, and only then consider withdrawing acceptance.
///
/// Absent or unparseable server state never silently enables the feature: the
/// client falls back to the compile-time gate for creation, and assumes
/// acceptance is still available so queued events keep draining.
class BinaryReviewRuntimeConfig {
  const BinaryReviewRuntimeConfig({
    required this.creationEnabled,
    required this.acceptanceEnabled,
  });

  /// The state assumed before the server has said anything.
  ///
  /// Creation defers to the compile-time gate; acceptance is optimistic so a
  /// client that has not yet synced still attempts to drain its queue.
  static const unknown = BinaryReviewRuntimeConfig(
    creationEnabled: null,
    acceptanceEnabled: true,
  );

  /// `null` means "the server has not spoken"; the compile-time gate decides.
  final bool? creationEnabled;

  final bool acceptanceEnabled;

  /// Whether the binary interaction should be offered to the learner now.
  ///
  /// A server `false` is authoritative and overrides the compile-time define —
  /// that is the entire point of the kill switch. A server `true` cannot enable
  /// the feature in a build that did not ship it, because such a build genuinely
  /// has no binary interaction to show.
  bool get showsBinaryReview =>
      BinaryReviewUiConfig.enabled && (creationEnabled ?? true);

  /// Parse the `binaryReview` block of a sync response.
  ///
  /// Hostile or garbage input must never flip the switch into a less safe state,
  /// so anything unrecognised degrades to [unknown].
  static BinaryReviewRuntimeConfig fromJson(Object? value) {
    if (value is! Map<String, dynamic>) return unknown;
    final creation = value['creationEnabled'];
    final acceptance = value['acceptanceEnabled'];
    return BinaryReviewRuntimeConfig(
      creationEnabled: creation is bool ? creation : null,
      acceptanceEnabled: acceptance is bool ? acceptance : true,
    );
  }

  Map<String, Object?> toJson() => {
        if (creationEnabled != null) 'creationEnabled': creationEnabled,
        'acceptanceEnabled': acceptanceEnabled,
      };

  @override
  bool operator ==(Object other) =>
      other is BinaryReviewRuntimeConfig &&
      other.creationEnabled == creationEnabled &&
      other.acceptanceEnabled == acceptanceEnabled;

  @override
  int get hashCode => Object.hash(creationEnabled, acceptanceEnabled);
}

/// Last switch state the server advertised, held where the UI can read it.
///
/// CP17 review finding H2: the switch previously reached [ReviewUploadResponse] and
/// stopped there, so a build whose compile-time define was `true` kept offering the
/// binary interaction after the operator disabled creation — the kill switch existed on
/// the wire but not in the product. This notifier is the one place the UI consults, and
/// the sync coordinator publishes into it on every successful upload.
///
/// Deliberately in-memory and process-scoped: it must not outlive a server that has been
/// repaired, and a restart re-learns the truth on the first sync. Until that first sync
/// the value is [BinaryReviewRuntimeConfig.unknown], which defers to the compile-time
/// gate, so this can never *enable* a feature the build did not ship.
class BinaryReviewSwitch extends ValueNotifier<BinaryReviewRuntimeConfig> {
  BinaryReviewSwitch([super.value = BinaryReviewRuntimeConfig.unknown]);

  /// Adopt what the server just advertised.
  ///
  /// A disable is STICKY against silence. `unknown` (`creationEnabled: null`)
  /// means "the server has not spoken", and silence must never undo an explicit
  /// operator disable: an absent or garbage `binaryReview` block would otherwise
  /// re-enable creation that was deliberately turned off, which is precisely the
  /// failure the kill switch exists to prevent. Only an explicit `true` from the
  /// server may lift a disable.
  void adopt(BinaryReviewRuntimeConfig next) {
    final wasDisabled = value.creationEnabled == false;
    final effective = (wasDisabled && next.creationEnabled == null)
        ? BinaryReviewRuntimeConfig(
            creationEnabled: false,
            acceptanceEnabled: next.acceptanceEnabled,
          )
        : next;
    if (effective != value) value = effective;
  }
}
