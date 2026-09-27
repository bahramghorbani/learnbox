import 'package:flutter_secure_storage/flutter_secure_storage.dart';

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
