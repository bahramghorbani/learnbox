import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// CP-6 / LB-B22: presentation redesign of the login/OTP screens. Behaviour is frozen, so
// these guard the pieces the redesign must NOT lose. Structural, source-level checks; the
// runtime OTP behaviour stays covered by learner-auth-gate.test.ts and otp-*.test.ts.
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const gate = read('app', 'components', 'AuthGate.tsx');
const css = read('app', 'globals.css');

describe('login/OTP redesign keeps the proven behaviour surface (LB-B22)', () => {
  it('keeps the 5-digit code length and both stages', () => {
    expect(gate).toContain('const otpLength = 5');
    expect(gate).toContain("'phone' | 'code'");
  });

  it('keeps the LB-B08 Telegram support escape path on the code screen', () => {
    expect(gate).toContain('data-testid="auth-support-link"');
    expect(gate).toContain("supportLinkFor('login')");
  });

  it('keeps routing every OTP error through the shared messaging helper', () => {
    expect(gate.match(/otpErrorMessage\(/g)!.length).toBeGreaterThanOrEqual(3);
    expect(gate).toContain('readRetryAfterSeconds');
  });

  it('keeps role=alert on the error text', () => {
    expect(gate).toContain('role="alert"');
  });

  it('shows an accessible two-step indicator whose meaning is text, not only colour', () => {
    expect(gate).toContain('function AuthStep');
    expect(gate).toMatch(/مرحلهٔ/);
    expect(gate.match(/aria-hidden="true"/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('marks invalid inputs with aria-invalid and styles them', () => {
    expect(gate.match(/aria-invalid=/g)).toHaveLength(2);
    expect(css).toContain("input[aria-invalid='true']");
  });

  it('keeps every login control at a 44px minimum touch target (WCAG 2.5.8)', () => {
    for (const sel of ['.auth-support-link', '.auth-install-link', '.auth-back']) {
      const rule = css.slice(css.indexOf(`${sel} {`));
      expect(rule.slice(0, rule.indexOf('}'))).toMatch(/min-height:\s*44px/);
    }
    expect(css).toMatch(/\.auth-form \.primary-button \{[^}]*min-height:\s*56px/);
  });
});
