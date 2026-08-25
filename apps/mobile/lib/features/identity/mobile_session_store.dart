import 'mobile_session.dart';

/// Persistence port for the dormant native learner session.
abstract interface class MobileSessionStore {
  Future<MobileSession?> read();
  Future<void> write(MobileSession session);
  Future<void> clear();
}
