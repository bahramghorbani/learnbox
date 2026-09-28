import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_DELETION_POLICY_VERSION,
  ALLOWED_AUDIT_FIELDS,
  LEARNER_DATA_TABLES,
  PROTECTED_TABLES,
  auditRecordLeaksPersonalData,
  buildDeletionAudit,
  buildDeletionPlan,
  planTouchesProtectedTable,
} from '../lib/account-deletion';

const counts = {
  reviewEventsRemoved: 12,
  schedulesRemoved: 7,
  sessionsRemoved: 1,
  purchasesPreserved: 0,
};

describe('deletion plan ordering', () => {
  it('refuses privileged accounts before touching any row', () => {
    const plan = buildDeletionPlan();
    expect(plan[0]).toEqual({ kind: 'assert_deletable' });
  });

  it('preserves purchase evidence before anything is deleted', () => {
    const plan = buildDeletionPlan();
    const preserve = plan.findIndex((step) => step.kind === 'preserve_purchase_evidence');
    const firstDelete = plan.findIndex(
      (step) => step.kind === 'delete_rows' || step.kind === 'delete_user',
    );
    expect(preserve).toBeGreaterThanOrEqual(0);
    expect(preserve).toBeLessThan(firstDelete);
  });

  it('anonymises the operational audit trail instead of deleting it', () => {
    const plan = buildDeletionPlan();
    expect(plan.some((step) => step.kind === 'anonymise_audit_logs')).toBe(true);
    expect(plan.some((step) => step.kind === 'delete_rows' && step.table === 'audit_logs')).toBe(
      false,
    );
  });

  it('clears every learner table discovered in the live schema', () => {
    const plan = buildDeletionPlan();
    const deleted = plan.flatMap((step) => (step.kind === 'delete_rows' ? [step.table] : []));
    // Derived from the live foreign-key map, not from assumption.
    expect(deleted).toEqual([
      'review_events',
      'card_schedules',
      'learner_reconciliation_cursors',
      'mobile_learner_sessions',
      'user_packs',
      'payment_logs',
    ]);
  });

  it('deletes the user row only after every child table is cleared', () => {
    const plan = buildDeletionPlan();
    const userIndex = plan.findIndex((step) => step.kind === 'delete_user');
    const lastChild = plan.reduce(
      (acc, step, index) => (step.kind === 'delete_rows' ? index : acc),
      -1,
    );
    expect(lastChild).toBeGreaterThan(-1);
    expect(userIndex).toBeGreaterThan(lastChild);
  });

  it('writes the audit record last so counts are accurate', () => {
    const plan = buildDeletionPlan();
    expect(plan[plan.length - 1]).toEqual({ kind: 'write_audit' });
  });

  it('clears every known learner-data table', () => {
    const tables = buildDeletionPlan()
      .filter((step): step is { kind: 'delete_rows'; table: string } => step.kind === 'delete_rows')
      .map((step) => step.table);
    expect(tables).toEqual([...LEARNER_DATA_TABLES]);
  });

  it('never targets content, catalogue or owner tables', () => {
    expect(planTouchesProtectedTable(buildDeletionPlan())).toBe(false);
  });

  it('flags a plan that would touch protected data', () => {
    expect(planTouchesProtectedTable([{ kind: 'delete_rows', table: 'cards' }])).toBe(true);
  });

  it('keeps learner and protected table sets disjoint', () => {
    const overlap = LEARNER_DATA_TABLES.filter((table) => PROTECTED_TABLES.includes(table));
    expect(overlap).toEqual([]);
  });

  it('does not delete purchase_events as ordinary learner data', () => {
    expect(LEARNER_DATA_TABLES).not.toContain('purchase_events');
  });
});

describe('deletion audit record', () => {
  const audit = buildDeletionAudit({
    subjectHash: 'hAsH-Of-PhOnE',
    priorUserId: '11111111-2222-3333-4444-555555555555',
    requestedAt: new Date('2026-09-28T10:00:00.000Z'),
    actor: 'learner',
    counts,
  });

  it('records the policy version it executed under', () => {
    expect(audit.policyVersion).toBe(ACCOUNT_DELETION_POLICY_VERSION);
  });

  it('records timestamps, actor, status and disposition counts', () => {
    expect(audit).toMatchObject({
      requestedAt: '2026-09-28T10:00:00.000Z',
      actor: 'learner',
      status: 'completed',
      counts,
    });
  });

  it('carries no field outside the allowed minimum set', () => {
    expect(Object.keys(audit).sort()).toEqual([...ALLOWED_AUDIT_FIELDS].sort());
  });

  it('holds no phone number, name or other personal data', () => {
    expect(auditRecordLeaksPersonalData(audit)).toBe(false);
  });

  it('detects a record that leaks personal data', () => {
    const leaky = { ...audit, phoneE164: '+989123456789' } as never;
    expect(auditRecordLeaksPersonalData(leaky)).toBe(true);
  });

  it('references the learner only through a non-reversible hash', () => {
    expect(audit.subjectHash).not.toMatch(/\+?98\d/);
    expect(JSON.stringify(audit)).not.toContain('+98');
  });

  it('supports an owner-initiated support deletion', () => {
    const supportAudit = buildDeletionAudit({
      subjectHash: 'h',
      priorUserId: 'u',
      requestedAt: new Date(),
      actor: 'owner_support',
      counts,
    });
    expect(supportAudit.actor).toBe('owner_support');
  });

  it('can record a failed deletion attempt', () => {
    const failed = buildDeletionAudit({
      subjectHash: 'h',
      priorUserId: 'u',
      requestedAt: new Date(),
      actor: 'learner',
      counts,
      status: 'failed',
    });
    expect(failed.status).toBe('failed');
  });

  it('rejects an audit record without a subject reference', () => {
    expect(() =>
      buildDeletionAudit({
        subjectHash: '',
        priorUserId: 'u',
        requestedAt: new Date(),
        actor: 'learner',
        counts,
      }),
    ).toThrow(/subject hash/i);
  });

  it('rejects an audit record without the prior account reference', () => {
    expect(() =>
      buildDeletionAudit({
        subjectHash: 'h',
        priorUserId: '',
        requestedAt: new Date(),
        actor: 'learner',
        counts,
      }),
    ).toThrow(/prior user id/i);
  });
});
