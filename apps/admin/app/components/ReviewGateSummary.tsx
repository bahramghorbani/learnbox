'use client';

import React from 'react';

export type ReviewDimension =
  'german_linguistic' | 'persian_translation' | 'provenance' | 'visual' | 'audio' | 'app_flow';

export type ReviewOutcome = 'pending' | 'passed' | 'failed';

export interface ReviewDimensionState {
  dimension: ReviewDimension;
  outcome: ReviewOutcome;
}

const labels: Record<ReviewDimension, string> = {
  german_linguistic: 'بررسی آلمانی',
  persian_translation: 'ترجمهٔ فارسی',
  provenance: 'منشأ و استناد',
  visual: 'بازبینی بصری',
  audio: 'بازبینی صوتی',
  app_flow: 'تست جریان کار',
};

const outcomeLabels: Record<ReviewOutcome, string> = {
  pending: 'در انتظار بررسی',
  passed: 'تأییدشده',
  failed: 'ناموفق',
};

export function ReviewGateSummary({ checks }: { checks: ReviewDimensionState[] }) {
  const failedCount = checks.filter((check) => check.outcome === 'failed').length;
  const pendingCount = checks.filter((check) => check.outcome === 'pending').length;
  const complete = checks.length === 6 && checks.every((check) => check.outcome === 'passed');

  return (
    <section className="review-gate-summary" aria-labelledby="review-gate-title">
      <div className="review-gate-heading">
        <div>
          <h2 id="review-gate-title">گیت بررسی محتوا</h2>
          <p>تکمیل بررسی‌ها شرط لازم است؛ انتشار واقعی مرحله‌ای جداگانه و کنترل‌شده است.</p>
        </div>
        <strong data-status={complete ? 'review-complete' : 'publication-blocked'}>
          {complete ? 'همهٔ بررسی‌ها تکمیل است' : 'انتشار مسدود است'}
        </strong>
      </div>

      <ul className="review-gate-list">
        {checks.map((check) => (
          <li key={check.dimension} data-outcome={check.outcome}>
            <span aria-hidden="true">
              {check.outcome === 'passed' ? '✓' : check.outcome === 'failed' ? '!' : '○'}
            </span>
            <span>{labels[check.dimension]}</span>
            <small>{outcomeLabels[check.outcome]}</small>
          </li>
        ))}
      </ul>

      {complete ? (
        <p role="status" className="review-gate-note">
          همهٔ بررسی‌ها تکمیل است؛ انتشار همچنان نیازمند تأیید ناشر است.
        </p>
      ) : (
        <p role="status" className="review-gate-note">
          {failedCount > 0 ? `${toPersianDigits(failedCount)} مورد ناموفق` : ''}
          {failedCount > 0 && pendingCount > 0 ? ' و ' : ''}
          {pendingCount > 0 ? `${toPersianDigits(pendingCount)} مورد در انتظار بررسی` : ''}
        </p>
      )}
    </section>
  );
}

function toPersianDigits(value: number): string {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}
