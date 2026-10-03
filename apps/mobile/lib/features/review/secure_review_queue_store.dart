import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'review_queue.dart';
import 'review_queue_store.dart';

class SecureReviewQueueStore implements ReviewQueueStore {
  SecureReviewQueueStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(
                resetOnError: false,
                migrateOnAlgorithmChange: true,
                migrateWithBackup: true,
                storageNamespace: storageNamespace,
              ),
            );

  static const storageKey = 'learnbox.reviewQueue.v1';
  static const storageNamespace = 'learnbox.reviewQueue.v1';

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() => _storage.read(key: storageKey);

  @override
  Future<void> write(String serializedEvents) =>
      _storage.write(key: storageKey, value: serializedEvents);
}

/// The production review queue, wired to both durable stores.
///
/// This factory exists so the composition is reachable from tests: mutant M21
/// showed that dropping the quarantine store in `main()` left every suite green,
/// because nothing could observe `main()`. Build the queue here, assert here.
ReviewQueue createProductionReviewQueue() => ReviewQueue(
      store: SecureReviewQueueStore(),
      quarantineStore: SecureReviewQuarantineStore(),
    );

/// Durable store for CP17 quarantine evidence, separate from the pending queue.
///
/// F3 moved quarantine out of the queue envelope so quarantine alone can no
/// longer push the envelope to v2 and make a pre-CP16 downgrade destructive.
/// That only holds if production actually supplies this store (review finding
/// H4): with no store the evidence is held in memory and lost on restart, which
/// is precisely the forensic recovery CP17 claims to preserve. Distinct key, so
/// a queue reset never destroys evidence and vice versa.
class SecureReviewQuarantineStore implements ReviewQueueStore {
  SecureReviewQuarantineStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(
                resetOnError: false,
                migrateOnAlgorithmChange: true,
                migrateWithBackup: true,
                storageNamespace: storageNamespace,
              ),
            );

  static const storageKey = 'learnbox.reviewQuarantine.v1';
  static const storageNamespace = 'learnbox.reviewQuarantine.v1';

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() => _storage.read(key: storageKey);

  @override
  Future<void> write(String serializedEvents) =>
      _storage.write(key: storageKey, value: serializedEvents);
}
