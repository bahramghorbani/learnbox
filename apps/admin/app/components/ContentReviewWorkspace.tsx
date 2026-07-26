'use client';

import { useState } from 'react';

import { AdminSidebar } from './AdminSidebar';

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
          <div className="editor-identity">
            <span className="editor-avatar">م.ر</span>
            <span>
              <strong>مریم رضایی</strong>
              <small>ویرایشگر محتوا</small>
            </span>
          </div>
        </header>

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
                تأیید برای انتشار
              </button>
              <button
                className="return-button"
                type="button"
                onClick={() => chooseStatus('returned')}
              >
                بازگرداندن برای اصلاح
              </button>
              {status !== 'needs_review' ? (
                <p className="prototype-note" role="status">
                  تغییر فقط در پیش‌نمایش محلی ثبت شد؛ انتشار واقعی نیازمند ورود امن است.
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
