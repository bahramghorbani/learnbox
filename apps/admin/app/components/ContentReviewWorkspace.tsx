'use client';

import { useState } from 'react';

import manifest from '../../../../content/packs/learnbox-start/manifest.json';
import drafts from '../../../../content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json';
import type { ContentPackManifest, LearningVocabularyItem } from '@learnbox/content-models';

import { AdminSidebar } from './AdminSidebar';
import { PackReleasePanel } from './PackReleasePanel';
import { ReviewGateSummary } from './ReviewGateSummary';
import { ReviewQueueOverview } from './ReviewQueueOverview';
import { SplashReplacementPanel } from './SplashReplacementPanel';

type LocalReviewStatus = 'needs_review' | 'approved' | 'returned';

const statusCopy: Record<LocalReviewStatus, string> = {
  needs_review: 'نیازمند بررسی',
  approved: 'در پیش‌نمایش تأیید شد',
  returned: 'برای اصلاح بازگردانده شد',
};

export function ContentReviewWorkspace() {
  const [status, setStatus] = useState<LocalReviewStatus>('needs_review');
  const chooseStatus = (nextStatus: LocalReviewStatus) => setStatus(nextStatus);

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
          <section className="review-card" aria-labelledby="card-title">
            <div className="review-card-heading">
              <span aria-hidden="true">▣</span>کارت واژگان
            </div>
            <div className="word-section">
              <button className="sound-button" type="button" aria-label="پخش تلفظ das Haus">
                ♫
              </button>
              <div>
                <h2 id="card-title" lang="de" dir="ltr">
                  das Haus
                </h2>
                <p lang="de" dir="ltr">
                  das · Häuser
                </p>
              </div>
            </div>
            <div className="meaning-section">
              <button className="sound-button" type="button" aria-label="پخش معنی فارسی">
                ♫
              </button>
              <div>
                <h3>خانه</h3>
                <span className="word-kind">اسم</span>
              </div>
            </div>
            <div className="example-section">
              <span>مثال</span>
              <button className="sound-button" type="button" aria-label="پخش مثال آلمانی">
                ♫
              </button>
              <p lang="de" dir="ltr">
                Das Haus ist groß.
              </p>
              <p>خانه بزرگ است.</p>
            </div>
            <div className="media-section">
              <h3>رسانه‌ها</h3>
              <p>وضعیت آمادگی رسانه‌ها برای این کارت</p>
              <div className="media-checks">
                <span>✓ تصویر</span>
                <span>✓ صدای واژه</span>
                <span>✓ صدای مثال</span>
              </div>
            </div>
          </section>
          <aside className="review-inspector" aria-label="اطلاعات بررسی">
            <section>
              <h2>وضعیت</h2>
              <p className={`status-line status-${status}`}>● {statusCopy[status]}</p>
            </section>
            <section>
              <h2>اطمینان مدل</h2>
              <strong className="confidence">۹۲٪</strong>
              <div className="confidence-meter">
                <span />
              </div>
            </section>
            <section>
              <h2>بررسی‌های اعتبارسنجی</h2>
              <ul className="validation-list">
                <li>✓ ساختار کارت</li>
                <li>✓ املای آلمانی</li>
                <li>✓ ترجمهٔ فارسی</li>
                <li>✓ مثال و ترجمه</li>
                <li>✓ قواعد و جنسیت</li>
              </ul>
            </section>
            <section>
              <h2>منشأ</h2>
              <p className="provenance">پیشنهاد AI</p>
              <small>مدل: پیشنهاد آزمایشی</small>
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

        <ReviewGateSummary
          checks={[
            { dimension: 'german_linguistic', outcome: 'pending' },
            { dimension: 'persian_translation', outcome: 'pending' },
            { dimension: 'provenance', outcome: 'pending' },
            { dimension: 'visual', outcome: 'pending' },
            { dimension: 'audio', outcome: 'pending' },
            { dimension: 'app_flow', outcome: 'pending' },
          ]}
        />

        <ReviewQueueOverview
          batchId="learnbox-start-a1-vertical-slice-drafts-v1"
          items={(drafts.items as LearningVocabularyItem[]).map((item) => ({
            id: item.id,
            lemma: item.lemma,
            status: item.status === 'needs_review' ? 'needs_review' : 'returned',
          }))}
          publicationBlocked
        />

        <PackReleasePanel
          manifest={manifest as ContentPackManifest}
          items={drafts.items as LearningVocabularyItem[]}
          actorRole="content_reviewer"
        />
        <SplashReplacementPanel />
      </section>
    </main>
  );
}
