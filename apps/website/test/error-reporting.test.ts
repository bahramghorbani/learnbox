import { describe, expect, it } from 'vitest';

import {
  buildCapturedError,
  captureServerError,
  fingerprintError,
  redactSensitive,
} from '../lib/error-reporting';

describe('redaction', () => {
  it('removes postgres connection strings including credentials', () => {
    const redacted = redactSensitive(
      'connect failed postgresql://learnbox:hunter2@ep-x.eu-central-1.aws.neon.tech/neondb',
    );
    expect(redacted).not.toContain('hunter2');
    expect(redacted).not.toContain('neon.tech');
    expect(redacted).toContain('[redacted]');
  });

  it('removes bearer tokens and api keys', () => {
    expect(redactSensitive('Authorization: Bearer abc.def-ghi123')).not.toContain('abc.def');
    expect(redactSensitive('api_key=sk-live-9f8e7d6c5b')).not.toContain('sk-live');
  });

  it('removes telegram bot tokens', () => {
    const line = 'sendMessage failed for bot 8123456789:AAF-ZteQwertyuiopASDFGHJKLzxcvbnm12345';
    expect(redactSensitive(line)).not.toContain('AAF-Zte');
  });

  it('removes learner phone numbers in local and international form', () => {
    expect(redactSensitive('otp send failed for 09123456789')).not.toContain('09123456789');
    expect(redactSensitive('otp send failed for +989123456789')).not.toContain('989123456789');
  });

  it('removes signed session material', () => {
    const cookie = 'v1.eyJzdWJqZWN0IjoiYWJjZGVmIn0.c2lnbmF0dXJlLXZhbHVlLWhlcmU';
    expect(redactSensitive(`bad session ${cookie}`)).not.toContain('eyJzdWJqZWN0');
  });

  it('leaves ordinary operational text intact', () => {
    expect(redactSensitive('database connection pool exhausted')).toBe(
      'database connection pool exhausted',
    );
  });
});

describe('fingerprinting', () => {
  it('is stable for the same fault', () => {
    expect(fingerprintError('TypeError', 'cannot read x', '/api/learner/profile')).toBe(
      fingerprintError('TypeError', 'cannot read x', '/api/learner/profile'),
    );
  });

  it('groups the same fault across varying identifiers', () => {
    const a = fingerprintError('Error', 'user 8123 not found', '/api/learner/profile');
    const b = fingerprintError('Error', 'user 9987 not found', '/api/learner/profile');
    expect(a).toBe(b);
  });

  it('separates different faults', () => {
    const a = fingerprintError('TypeError', 'cannot read x', '/api/learner/profile');
    const b = fingerprintError('RangeError', 'out of range', '/api/reviews');
    expect(a).not.toBe(b);
  });

  it('separates the same message on different routes', () => {
    expect(fingerprintError('Error', 'failed', '/api/a')).not.toBe(
      fingerprintError('Error', 'failed', '/api/b'),
    );
  });
});

describe('captured error records', () => {
  it('captures name, route, method and timestamp', () => {
    const captured = buildCapturedError(
      new TypeError('pool exhausted'),
      { route: '/api/health', method: 'GET' },
      { clock: () => new Date('2026-09-28T10:00:00.000Z') },
    );

    expect(captured).toMatchObject({
      kind: 'learnbox.error',
      name: 'TypeError',
      message: 'pool exhausted',
      route: '/api/health',
      method: 'GET',
      occurredAt: '2026-09-28T10:00:00.000Z',
    });
  });

  it('redacts secrets before they reach the log sink', () => {
    const lines: string[] = [];
    captureServerError(
      new Error('connect postgresql://u:pw@host/db failed for 09123456789'),
      { route: '/api/health' },
      (line) => lines.push(line),
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('pw@host');
    expect(lines[0]).not.toContain('09123456789');
    expect(lines[0]).toContain('learnbox.error');
  });

  it('handles non-Error throwables without crashing', () => {
    const lines: string[] = [];
    const captured = captureServerError('plain string failure', {}, (line) => lines.push(line));
    expect(captured?.name).toBe('Error');
    expect(lines).toHaveLength(1);
  });

  it('never throws when the sink itself fails', () => {
    expect(() =>
      captureServerError(new Error('x'), {}, () => {
        throw new Error('sink is broken');
      }),
    ).not.toThrow();
  });

  it('emits exactly one parseable single-line JSON record', () => {
    const lines: string[] = [];
    captureServerError(new Error('multi\nline\nmessage'), {}, (line) => lines.push(line));
    expect(lines).toHaveLength(1);
    expect(lines[0].split('\n')).toHaveLength(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });
});
