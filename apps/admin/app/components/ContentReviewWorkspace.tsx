'use client';

import React, { useState } from 'react';

import manifest from '../../../../content/packs/learnbox-start/manifest.json';
import draftsJson from '../../../../content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json';
import type { ContentPackManifest, LearningVocabularyItem } from '@learnbox/content-models';

import { AdminSidebar } from './AdminSidebar';
import { PackReleasePanel } from './PackReleasePanel';
import { ReviewGateSummary, type ReviewDimensionState } from './ReviewGateSummary';
import { ReviewQueueOverview, type ReviewQueueItem } from './ReviewQueueOverview';
import { SplashReplacementPanel } from './SplashReplacementPanel';

type LocalReviewStatus = 'needs_review' | 'approved' | 'returned';

const statusCopy: Record<LocalReviewStatus, string> = {
  needs_review: 'نیازمند بررسی',
  approved: 'در پیش‌نمایش تأیید شد',
  returned: 'برای اصلاح بازگردانده شد',
};

const partOfSpeechLabels: Record<LearningVocabularyItem['partOfSpeech'], string> = {
  noun: 'اسم',
  verb: 'فعل',
  adjective: 'صفت',
  adverb: 'قید',
  phrase: 'عبارت',
  other: 'سایر',
};

const providerLabels: Record<LearningVocabularyItem['source']['provider'], string> = {
  editorial: 'ویراستاری',
  user: 'کاربر',
  ai_suggestion: 'پیشنهاد هوش مصنوعی',
};

const mediaKindLabels = {
  image: 'تصویر',
  word_audio: 'صدای واژه',
  sentence_audio: 'صدای مثال',
} as const;

const mediaKinds = ['image', 'word_audio', 'sentence_audio'] as const;

const reviewDimensions: ReviewDimensionState[] = [
  { dimension: 'german_linguistic', outcome: 'pending' },
  { dimension: 'persian_translation', outcome: 'pending' },
  { dimension: 'provenance', outcome: 'pending' },
  { dimension: 'visual', outcome: 'pending' },
  { dimension: 'audio', outcome: 'pending' },
  { dimension: 'app_flow', outcome: 'pending' },
];

function toQueueStatus(status: LearningVocabularyItem['status']): ReviewQueueItem['status'] {
  if (status === 'approved') return 'approved';
  if (status === 'needs_review') return 'needs_review';
  return 'returned';
}

/**
 * Local content review preview. It renders the committed Start Pack drafts and derives every
 * claim from that data: an unreviewed draft shows no passed validation, no media readiness and
 * no model confidence. Approve/return buttons only flip a local preview label; they never change
 * the drafts, the queue, the gate or any server state. Publication stays blocked here.
 */
export function ContentReviewWorkspace() {
  const [status, setStatus] = useState<LocalReviewStatus>('needs_review');
  const chooseStatus = (nextStatus: LocalReviewStatus) => setStatus(nextStatus);

  const drafts = draftsJson.items as LearningVocabularyItem[];
  const queueItems: ReviewQueueItem[] = drafts.map((item) => ({
    id: item.id,
    lemma: item.lemma,
    status: toQueueStatus(item.status),
  }));
  const card = drafts.find((item) => item.id === 'start-a1-haus') ?? drafts[0];

  return (
    <main className="admin-shell" id="review">
      <AdminSidebar />
      <section className="admin-workspace">
        <header className="admin-topbar">
          <h1>بازبینی محتوا</h1>
          <div className="editor-identity" aria-label="وضعیت پنل">
            <span className="editor-avatar" aria-hidden="true">
              پ
            </span>
            <span>
              <strong>پیش‌نمایش محلی</strong>
              <small>بدون ورود یا دسترسی انتشار</small>
            </span>
          </div>
        </header>

        <p className="admin-preview-notice" role="status">
          بازبینی محتوا در این نسخه پیش‌نمایش است. قابلیت‌های حساس فقط پس از ورود امن و فعال‌سازی
          مستقل همان قابلیت در سرور در دسترس قرار می‌گیرند.
        </p>

        <div className="review-layout">
          <ReviewCard card={card} />
          <aside className="review-inspector" aria-label="اطلاعات بررسی">
            <section>
              <h2>وضعیت</h2>
              <p className={`status-line status-${status}`}>● {statusCopy[status]}</p>
            </section>
            <section>
              <h2>منشأ</h2>
              <p className="provenance">{providerLabels[card.source.provider]}</p>
              {card.source.reference ? (
                <small lang="en" dir="ltr">
                  {card.source.reference}
                </small>
              ) : null}
            </section>
            <div className="review-actions">
              <button
                className="approve-button"
                type="button"
                onClick={() => chooseStatus('approved')}
              >
                تأیید در پیش‌نمایش
              </button>
              <button
                className="return-button"
                type="button"
                onClick={() => chooseStatus('returned')}
              >
                بازگرداندن برای اصلاح
              </button>
              <p className="prototype-note" role="status">
                تغییر فقط در پیش‌نمایش محلی ثبت می‌شود؛ انتشار واقعی نیازمند ورود امن و ناشر مجاز
                است.
              </p>
            </div>
          </aside>
        </div>

        <ReviewGateSummary checks={reviewDimensions} />

        <ReviewQueueOverview
          batchId="learnbox-start-a1-vertical-slice-drafts-v1"
          items={queueItems}
          publicationBlocked
        />

        <PackReleasePanel
          manifest={manifest as ContentPackManifest}
          items={drafts}
          actorRole="content_reviewer"
        />
        <SplashReplacementPanel />
      </section>
    </main>
  );
}

function ReviewCard({ card }: { card: LearningVocabularyItem }) {
  const germanLemma =
    card.article && card.partOfSpeech === 'noun' ? `${card.article} ${card.lemma}` : card.lemma;
  const meaning = card.persianMeanings[0] ?? '';
  const example = card.examples[0];
  const hasAttachedMedia = card.media.length > 0;

  return (
    <section className="review-card" aria-labelledby="card-title">
      <div className="review-card-heading">
        <span aria-hidden="true">▣</span>کارت واژگان
      </div>
      <div className="word-section">
        <div>
          <h2 id="card-title" lang="de" dir="ltr">
            {germanLemma}
          </h2>
          {card.essentialInflection ? (
            <p lang="de" dir="ltr">
              {card.essentialInflection}
            </p>
          ) : null}
          {card.pronunciation?.ipa ? (
            <p lang="de" dir="ltr">
              /{card.pronunciation.ipa}/
            </p>
          ) : null}
        </div>
      </div>
      <div className="meaning-section">
        <div>
          <h3>{meaning}</h3>
          <span className="word-kind">{partOfSpeechLabels[card.partOfSpeech]}</span>
        </div>
      </div>
      {example ? (
        <div className="example-section">
          <span>مثال</span>
          <p lang="de" dir="ltr">
            {example.german}
          </p>
          <p>{example.persian}</p>
        </div>
      ) : null}
      <div className="media-section">
        <h3>رسانه‌ها</h3>
        <p>
          {hasAttachedMedia
            ? 'رسانه‌های پیوست این کارت:'
            : 'رسانه‌ای برای این کارت ثبت نشده است؛ تولید و بازبینی رسانه انجام نشده.'}
        </p>
        <div className="media-checks">
          {mediaKinds.map((kind) => (
            <span
              data-media-kind={kind}
              data-media-state={hasAttachedMedia ? 'attached' : 'missing'}
              key={kind}
            >
              {hasAttachedMedia ? '✓' : '○'} {mediaKindLabels[kind]}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
