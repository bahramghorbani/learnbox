/**
 * Telegram destination configuration for LearnBox (LB-B02 monitoring, LB-B04/LB-B08 support).
 *
 * LearnBox uses two SEPARATE Telegram bots with different audiences:
 *
 *  - monitoring (@learnboxmonitoringbot): operational alerts, owner/operator only.
 *  - support   (@learnboxsupportbot):     learner-facing contact and OTP escape path.
 *
 * Routing an operational alert to the learner support destination would leak internal diagnostics
 * to users, and routing a learner message to the monitoring bot would silently lose it. The two
 * configurations are therefore modelled as distinct types with distinct env keys, and a
 * cross-wiring check that fails closed.
 */

export type TelegramChannel = 'monitoring' | 'support';

/** Env keys per channel. Deliberately unambiguous: no shared or generic name. */
export const TELEGRAM_ENV_KEYS = {
  monitoring: {
    token: 'LEARNBOX_MONITORING_TELEGRAM_BOT_TOKEN',
    chatId: 'LEARNBOX_MONITORING_TELEGRAM_CHAT_ID',
  },
  support: {
    token: 'LEARNBOX_SUPPORT_TELEGRAM_BOT_TOKEN',
    chatId: 'LEARNBOX_SUPPORT_TELEGRAM_CHAT_ID',
  },
} as const;

/** The public support identity shown to learners. A username is not a secret. */
export const SUPPORT_TELEGRAM_USERNAME = 'learnboxsupportbot';

/** Public deep link for the learner support path. */
export function supportTelegramUrl(): string {
  return `https://t.me/${SUPPORT_TELEGRAM_USERNAME}`;
}

/**
 * The monitoring bot must never be presented to learners. Any learner-facing surface that asks for
 * a support contact goes through `supportTelegramUrl()`; this guard makes an accidental swap fail
 * a test rather than ship.
 */
export const MONITORING_TELEGRAM_USERNAME = 'learnboxmonitoringbot';

export type TelegramDestination = {
  readonly channel: TelegramChannel;
  readonly token: string;
  readonly chatId: string;
};

export type DestinationProblem =
  | { readonly kind: 'missing'; readonly key: string }
  | { readonly kind: 'malformed'; readonly key: string }
  | { readonly kind: 'cross_wired'; readonly detail: string };

/** Telegram bot tokens look like `<bot_id>:<secret>`; the bot id alone is not sensitive. */
const TOKEN_SHAPE = /^\d{6,}:[A-Za-z0-9_-]{30,}$/;
const CHAT_ID_SHAPE = /^-?\d{5,}$/;

/** Bot id prefix, safe to log: it identifies which bot without revealing the secret half. */
export function tokenBotId(token: string): string {
  const [id] = token.split(':');
  return id ?? '';
}

/**
 * Reads and validates one channel's destination.
 *
 * Returns problems instead of throwing so a caller can report every misconfiguration at once, and
 * so a missing support destination never takes down the app.
 */
export function readDestination(
  channel: TelegramChannel,
  env: Record<string, string | undefined>,
): { destination: TelegramDestination | null; problems: readonly DestinationProblem[] } {
  const keys = TELEGRAM_ENV_KEYS[channel];
  const problems: DestinationProblem[] = [];
  const token = env[keys.token]?.trim();
  const chatId = env[keys.chatId]?.trim();

  if (!token) problems.push({ kind: 'missing', key: keys.token });
  else if (!TOKEN_SHAPE.test(token)) problems.push({ kind: 'malformed', key: keys.token });

  if (!chatId) problems.push({ kind: 'missing', key: keys.chatId });
  else if (!CHAT_ID_SHAPE.test(chatId)) problems.push({ kind: 'malformed', key: keys.chatId });

  if (problems.length > 0 || !token || !chatId) return { destination: null, problems };
  return { destination: { channel, token, chatId }, problems: [] };
}

/**
 * Fails closed when the two channels share a token or a chat id.
 *
 * This is the check that prevents the specific accident the owner called out: monitoring alerts
 * silently arriving in the learner support channel.
 */
export function detectCrossWiring(
  env: Record<string, string | undefined>,
): readonly DestinationProblem[] {
  const problems: DestinationProblem[] = [];
  const monitoringToken = env[TELEGRAM_ENV_KEYS.monitoring.token]?.trim();
  const supportToken = env[TELEGRAM_ENV_KEYS.support.token]?.trim();
  const monitoringChat = env[TELEGRAM_ENV_KEYS.monitoring.chatId]?.trim();
  const supportChat = env[TELEGRAM_ENV_KEYS.support.chatId]?.trim();

  if (monitoringToken && supportToken && monitoringToken === supportToken) {
    problems.push({
      kind: 'cross_wired',
      detail: 'monitoring and support share one bot token',
    });
  }
  if (monitoringChat && supportChat && monitoringChat === supportChat) {
    problems.push({
      kind: 'cross_wired',
      detail: 'monitoring and support share one chat id',
    });
  }
  return problems;
}

/** Human-readable, secret-free description for startup logs and ops output. */
export function describeDestination(destination: TelegramDestination): string {
  return `${destination.channel} -> bot ${tokenBotId(destination.token)}, chat ${destination.chatId}`;
}
