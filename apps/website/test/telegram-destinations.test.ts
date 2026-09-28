import { describe, expect, it } from 'vitest';

import {
  MONITORING_TELEGRAM_USERNAME,
  SUPPORT_TELEGRAM_USERNAME,
  TELEGRAM_ENV_KEYS,
  describeDestination,
  detectCrossWiring,
  readDestination,
  supportTelegramUrl,
  tokenBotId,
} from '../lib/telegram-destinations';

const MONITORING_TOKEN = '7000000001:AAHslFakeMonitoringTokenForTestsOnly1234';
const SUPPORT_TOKEN = '7000000002:AAHslFakeSupportTokenForTestsOnly12345678';

const validEnv = {
  [TELEGRAM_ENV_KEYS.monitoring.token]: MONITORING_TOKEN,
  [TELEGRAM_ENV_KEYS.monitoring.chatId]: '5737241524',
  [TELEGRAM_ENV_KEYS.support.token]: SUPPORT_TOKEN,
  [TELEGRAM_ENV_KEYS.support.chatId]: '5737241524',
};

describe('channel separation', () => {
  it('uses distinct env keys for monitoring and support', () => {
    expect(TELEGRAM_ENV_KEYS.monitoring.token).not.toBe(TELEGRAM_ENV_KEYS.support.token);
    expect(TELEGRAM_ENV_KEYS.monitoring.chatId).not.toBe(TELEGRAM_ENV_KEYS.support.chatId);
  });

  it('never reuses a generic ambiguous name', () => {
    const keys = Object.values(TELEGRAM_ENV_KEYS).flatMap((k) => [k.token, k.chatId]);
    for (const key of keys) {
      expect(key).toMatch(/MONITORING|SUPPORT/);
    }
  });

  it('rejects a shared bot token across channels', () => {
    const problems = detectCrossWiring({
      ...validEnv,
      [TELEGRAM_ENV_KEYS.support.token]: MONITORING_TOKEN,
    });
    expect(problems.some((p) => p.kind === 'cross_wired')).toBe(true);
  });

  it('rejects a shared chat id across channels', () => {
    // Same owner chat for both bots is still a misconfiguration: support messages from learners
    // and operational alerts must not land in one undifferentiated stream.
    const problems = detectCrossWiring(validEnv);
    expect(problems.some((p) => p.kind === 'cross_wired')).toBe(true);
  });

  it('accepts properly separated destinations', () => {
    const problems = detectCrossWiring({
      ...validEnv,
      [TELEGRAM_ENV_KEYS.support.chatId]: '5737241599',
    });
    expect(problems).toHaveLength(0);
  });

  it('keeps the monitoring bot out of the learner-facing support link', () => {
    expect(supportTelegramUrl()).toContain(SUPPORT_TELEGRAM_USERNAME);
    expect(supportTelegramUrl()).not.toContain(MONITORING_TELEGRAM_USERNAME);
  });
});

describe('destination validation', () => {
  it('reads a valid monitoring destination', () => {
    const { destination, problems } = readDestination('monitoring', validEnv);
    expect(problems).toHaveLength(0);
    expect(destination?.chatId).toBe('5737241524');
  });

  it('reports missing configuration instead of throwing', () => {
    const { destination, problems } = readDestination('support', {});
    expect(destination).toBeNull();
    expect(problems.filter((p) => p.kind === 'missing')).toHaveLength(2);
  });

  it('rejects a malformed token', () => {
    const { destination, problems } = readDestination('monitoring', {
      ...validEnv,
      [TELEGRAM_ENV_KEYS.monitoring.token]: 'not-a-token',
    });
    expect(destination).toBeNull();
    expect(problems.some((p) => p.kind === 'malformed')).toBe(true);
  });

  it('rejects a malformed chat id', () => {
    const { destination, problems } = readDestination('monitoring', {
      ...validEnv,
      [TELEGRAM_ENV_KEYS.monitoring.chatId]: 'abc',
    });
    expect(destination).toBeNull();
    expect(problems.some((p) => p.kind === 'malformed')).toBe(true);
  });

  it('accepts a negative group chat id', () => {
    const { destination } = readDestination('monitoring', {
      ...validEnv,
      [TELEGRAM_ENV_KEYS.monitoring.chatId]: '-1001234567890',
    });
    expect(destination?.chatId).toBe('-1001234567890');
  });
});

describe('secret safety', () => {
  it('never includes the secret half of a token in a description', () => {
    const { destination } = readDestination('monitoring', validEnv);
    const described = describeDestination(destination!);
    expect(described).not.toContain('AAHslFakeMonitoringTokenForTestsOnly1234');
    expect(described).toContain('7000000001');
  });

  it('extracts only the non-sensitive bot id', () => {
    expect(tokenBotId(MONITORING_TOKEN)).toBe('7000000001');
    expect(tokenBotId(MONITORING_TOKEN)).not.toContain(':');
  });

  it('carries no real token in this test file', () => {
    // Guards against a future edit pasting a live token into fixtures.
    expect(MONITORING_TOKEN).toContain('Fake');
    expect(SUPPORT_TOKEN).toContain('Fake');
  });
});
