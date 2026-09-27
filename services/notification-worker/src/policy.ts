export type NotificationCategory =
  | 'daily_review'
  | 'at_risk_words'
  | 'short_session'
  | 'weekly_report'
  | 'achievement'
  | 'content_pack'
  | 'subscription_event'
  | 'return_after_absence';

export interface NotificationPreferences {
  permissionGranted: boolean;
  enabledCategories: NotificationCategory[];
  quietHours?: { startsAtHour: number; endsAtHour: number };
  maxPerDay: number;
}

export interface NotificationCandidate {
  category: NotificationCategory;
  localHour: number;
  sentToday: number;
  consecutiveUnopened: number;
}

export type NotificationDecision =
  | { shouldSend: true }
  | {
      shouldSend: false;
      reason: 'permission' | 'category' | 'quiet_hours' | 'frequency_cap' | 'fatigue';
    };

/**
 * Conservative scheduling policy. A caller may send only after this returns true;
 * it never grants notification permission or writes a device token.
 */
export function decideNotification(
  preferences: NotificationPreferences,
  candidate: NotificationCandidate,
): NotificationDecision {
  if (!preferences.permissionGranted) return { shouldSend: false, reason: 'permission' };
  if (!preferences.enabledCategories.includes(candidate.category)) {
    return { shouldSend: false, reason: 'category' };
  }
  if (isQuietHour(candidate.localHour, preferences.quietHours)) {
    return { shouldSend: false, reason: 'quiet_hours' };
  }
  if (candidate.sentToday >= preferences.maxPerDay) {
    return { shouldSend: false, reason: 'frequency_cap' };
  }
  if (candidate.consecutiveUnopened >= 3 && candidate.category !== 'subscription_event') {
    return { shouldSend: false, reason: 'fatigue' };
  }
  return { shouldSend: true };
}

function isQuietHour(
  localHour: number,
  quietHours: NotificationPreferences['quietHours'],
): boolean {
  if (!quietHours) return false;
  const { startsAtHour, endsAtHour } = quietHours;
  if (startsAtHour === endsAtHour) return false;
  return startsAtHour < endsAtHour
    ? localHour >= startsAtHour && localHour < endsAtHour
    : localHour >= startsAtHour || localHour < endsAtHour;
}
