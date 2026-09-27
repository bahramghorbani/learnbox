'use client';

import React from 'react';

export type ReviewQueueItem = {
  id: string;
  lemma: string;
  status: 'needs_review' | 'approved' | 'returned';
};

export function ReviewQueueOverview({
  batchId,
  items,
  publicationBlocked,
}: {
  batchId: string;
  items: ReviewQueueItem[];
  publicationBlocked: boolean;
}) {
  const pendingCount = items.filter((item) => item.status === 'needs_review').length;
  const blocked = publicationBlocked || pendingCount > 0;

  return (
    <section className="review-queue-overview" aria-labelledby="review-queue-title">
      <div className="review-queue-heading">
        <div>
          <h2 id="review-queue-title">صف بررسی محتوا</h2>
          <p lang="en" dir="ltr">
            {batchId}
          </p>
        </div>
        <strong data-status={blocked ? 'publication-blocked' : 'review-queue-open'}>
          {blocked ? 'انتشار مسدود است' : 'صف بررسی باز است'}
        </strong>
      </div>
      {items.length === 0 ? (
        <p role="status">هیچ کارتی در صف بررسی نیست</p>
      ) : (
        <>
          <p role="status">{toPersianDigits(pendingCount)} کارت در انتظار بررسی</p>
          <ul className="review-queue-list">
            {items.map((item) => (
              <li key={item.id} data-review-item={item.id}>
                <span lang="de" dir="ltr">
                  {item.lemma}
                </span>
                <small lang="en" dir="ltr">
                  {item.id}
                </small>
                <strong>{statusLabel(item.status)}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function statusLabel(status: ReviewQueueItem['status']): string {
  if (status === 'needs_review') return 'نیازمند بررسی';
  if (status === 'approved') return 'تأیید سردبیری';
  return 'بازگردانده‌شده';
}

function toPersianDigits(value: number): string {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}
