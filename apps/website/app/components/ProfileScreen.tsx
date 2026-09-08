import type { RefObject } from 'react';

import { LearnerNav, type LearnerDestination } from './LearnerNav';
import { toPersianDigits } from '../persian-digits';

export type LearnerLearningGoal = 'life' | 'career' | 'travel';

// Device-local learning-goal titles, kept in sync with OnboardingGoal copy so the
// Profile and Settings surfaces render the exact label the learner chose.
export const learnerGoalTitle: Record<LearnerLearningGoal, string> = {
  life: 'زندگی در آلمان',
  career: 'کار و دانشگاه',
  travel: 'سفر و ارتباط',
};

interface ProfileScreenProps {
  goal: LearnerLearningGoal | null;
  pendingReviewCount: number;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  goalRowRef?: RefObject<HTMLButtonElement | null>;
  settingsRowRef?: RefObject<HTMLButtonElement | null>;
  onChooseGoal: () => void;
  onNavigate: (destination: LearnerDestination) => void;
  onOpenSettings: () => void;
}

// Approved informational destinations from the landing legal spec (verified public
// destinations). The learner app opens them without depending on the marketing site.
const privacyUrl = 'https://learnboxapp.com/privacy';
const supportEmail = 'mailto:hi@learnboxapp.com';

export function ProfileScreen({
  goal,
  pendingReviewCount,
  headingRef,
  goalRowRef,
  settingsRowRef,
  onChooseGoal,
  onNavigate,
  onOpenSettings,
}: ProfileScreenProps) {
  return (
    <main className="app-shell profile-shell" data-testid="learnbox-profile">
      <header className="profile-brand">
        <span className="brand">LearnBox</span>
      </header>
      <section className="profile-intro" aria-labelledby="profile-title">
        <h1 id="profile-title" tabIndex={-1} ref={headingRef}>
          پروفایل
        </h1>
        <p>حساب و وضعیت یادگیری‌ات اینجا فقط از داده‌های همین دستگاه ساخته می‌شود.</p>
      </section>
      <section className="profile-section" aria-labelledby="profile-account-title">
        <h2 id="profile-account-title">حساب</h2>
        <div className="profile-card">
          <strong className="profile-account-name">حساب LearnBox</strong>
          <p className="profile-card-note">
            در این نسخهٔ آزمایشی، نام، شمارهٔ تلفن یا مشخصات شخصی از سرور خوانده نمی‌شود؛ این برچسب
            عمومی جای آن‌هاست.
          </p>
        </div>
      </section>
      <section className="profile-section" aria-labelledby="profile-learning-title">
        <h2 id="profile-learning-title">یادگیری</h2>
        <div className="profile-card profile-fact">
          <span className="profile-fact-label">هدف یادگیری</span>
          {goal ? (
            <>
              <strong className="profile-fact-value">{learnerGoalTitle[goal]}</strong>
              <span className="device-local-badge">فقط در این دستگاه</span>
            </>
          ) : (
            <button
              className="text-button profile-choose-goal"
              type="button"
              ref={goalRowRef}
              onClick={onChooseGoal}
            >
              انتخاب هدف
            </button>
          )}
        </div>
      </section>
      <section className="profile-section" aria-labelledby="profile-status-title">
        <h2 id="profile-status-title">وضعیت</h2>
        <div className="profile-card profile-fact">
          <span className="profile-fact-label">وضعیت همگام‌سازی پاسخ‌ها</span>
          {pendingReviewCount > 0 ? (
            <strong className="profile-fact-value" role="status">
              {toPersianDigits(pendingReviewCount)} پاسخ فقط روی این دستگاه ذخیره شده و هنوز از سرور
              تأیید نشده است.
            </strong>
          ) : (
            <strong className="profile-fact-value profile-idle" role="status">
              رویدادی در صف همگام‌سازی پاسخ‌های مرور نیست.
            </strong>
          )}
          <p className="profile-card-note">
            همگام‌سازی خودکار هنوز فعال نیست؛ این شمارش فقط صف واقعی همین مرورگر را نشان می‌دهد.
          </p>
        </div>
      </section>
      <section className="profile-section" aria-labelledby="profile-access-title">
        <h2 id="profile-access-title">دسترسی</h2>
        <div className="profile-rows">
          <button
            className="profile-row"
            type="button"
            ref={settingsRowRef}
            onClick={onOpenSettings}
          >
            <span className="profile-row-copy">
              <strong>تنظیمات</strong>
              <small>هدف یادگیری و اطلاعات دستگاه</small>
            </span>
            <span className="profile-row-arrow" aria-hidden="true">
              ←
            </span>
          </button>
          <a className="profile-row" href={privacyUrl} target="_blank" rel="noreferrer">
            <span className="profile-row-copy">
              <strong>حریم خصوصی</strong>
              <small className="profile-row-url" dir="ltr">
                learnboxapp.com/privacy
              </small>
            </span>
            <span className="profile-row-arrow" aria-hidden="true">
              ↗
            </span>
          </a>
          <a className="profile-row" href={supportEmail}>
            <span className="profile-row-copy">
              <strong>پشتیبانی</strong>
              <small className="profile-row-url" dir="ltr">
                hi@learnboxapp.com
              </small>
            </span>
            <span className="profile-row-arrow" aria-hidden="true">
              ↗
            </span>
          </a>
        </div>
      </section>
      <LearnerNav current="profile" onNavigate={onNavigate} />
    </main>
  );
}
