import 'start_card.dart';

abstract interface class StartPackRepository {
  Future<List<StartCard>> loadDailySession();
}
