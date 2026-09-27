abstract interface class ReviewQueueStore {
  Future<String?> read();

  Future<void> write(String serializedEvents);
}
