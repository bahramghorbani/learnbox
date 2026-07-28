export const ANALYTICS_EVENT_NAMES = [
  'free_pack_started',
  'first_session_completed',
  'learned_word_count_25',
  'learned_word_count_50',
  'learned_word_count_100',
  'paywall_eligible',
  'paywall_viewed',
  'paywall_dismissed',
  'subscription_started',
  'subscription_completed',
  'subscription_failed',
  'free_content_completed',
  'personal_word_limit_reached',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];
export type AnalyticsConsent = 'unknown' | 'granted' | 'denied';
export type AnalyticsProperties = Readonly<Record<string, string>>;

export interface PrivacySafeAnalyticsEvent {
  name: AnalyticsEventName;
  properties: AnalyticsProperties;
  occurredAt: string;
}

export interface AnalyticsDeliveryAdapter {
  deliver(event: PrivacySafeAnalyticsEvent): Promise<void>;
}

const permittedPropertyKeys: Readonly<Record<AnalyticsEventName, readonly string[]>> = {
  free_pack_started: ['pack_id', 'content_version'],
  first_session_completed: ['session_length_bucket'],
  learned_word_count_25: ['pack_id'],
  learned_word_count_50: ['pack_id'],
  learned_word_count_100: ['pack_id'],
  paywall_eligible: ['rule_version', 'signal'],
  paywall_viewed: ['offer_version', 'placement'],
  paywall_dismissed: ['offer_version', 'placement'],
  subscription_started: ['tier_id', 'period_id', 'provider'],
  subscription_completed: ['tier_id', 'period_id', 'provider'],
  subscription_failed: ['tier_id', 'period_id', 'provider'],
  free_content_completed: ['pack_id', 'content_version'],
  personal_word_limit_reached: ['limit_version'],
};

const stableValue = /^[a-z0-9][a-z0-9_:-]{0,79}$/;

export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return (ANALYTICS_EVENT_NAMES as readonly string[]).includes(value);
}

/**
 * Builds an allowlisted, coarse event. It deliberately rejects identifiers, free text and
 * unexpected fields instead of trying to redact them after collection.
 */
export function createPrivacySafeAnalyticsEvent(
  name: AnalyticsEventName,
  properties: AnalyticsProperties,
  occurredAt = new Date(),
): PrivacySafeAnalyticsEvent {
  const allowedKeys = permittedPropertyKeys[name];
  const propertyKeys = Object.keys(properties).sort();

  if (
    propertyKeys.length !== allowedKeys.length ||
    propertyKeys.some((key, index) => key !== [...allowedKeys].sort()[index])
  ) {
    throw new Error(`Analytics event ${name} has invalid properties.`);
  }

  for (const value of Object.values(properties)) {
    if (!stableValue.test(value)) {
      throw new Error(`Analytics event ${name} contains a non-coarse property value.`);
    }
  }

  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error('Analytics event time must be valid.');
  }

  return {
    name,
    properties: { ...properties },
    occurredAt: occurredAt.toISOString(),
  };
}

/** No telemetry leaves the device until a future client obtains explicit consent. */
export class ConsentGatedAnalyticsClient {
  constructor(
    private readonly delivery: AnalyticsDeliveryAdapter,
    private readonly consent: AnalyticsConsent,
  ) {}

  async track(
    name: AnalyticsEventName,
    properties: AnalyticsProperties,
    occurredAt?: Date,
  ): Promise<boolean> {
    if (this.consent !== 'granted') return false;
    await this.delivery.deliver(createPrivacySafeAnalyticsEvent(name, properties, occurredAt));
    return true;
  }
}
