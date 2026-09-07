import type { RefObject } from 'react';

import { learnerGoalTitle, type LearnerLearningGoal } from './ProfileScreen';

interface SettingsScreenProps {
  goal: LearnerLearningGoal;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onChooseGoal: () => void;
}

// M3-P1 Settings foundation: only the real device-local goal plus truthful
// informational rows. Sound preference (M3-S1), reminders and purchases stay absent.
export function SettingsScreen({ goal, headingRef, onBack, onChooseGoal }: SettingsScreenProps) {
  return (
    <main className="app-shell settings-shell" data-testid="learnbox-settings">
      <header className="settings-top">
        <button className="settings-back text-button" type="button" onClick={onBack}>
          <span aria-hidden="true">→</span>
          بازگشت به پروفایل
        </button>
      </header>
      <section className="settings-intro" aria-labelledby="settings-title">
        <h1 id="settings-title" tabIndex={-1} ref={headingRef}>
          تنظیمات
        </h1>
        <p>تنظیمات این نسخه فقط روی همین دستگاه اعمال می‌شود.</p>
      </section>
      <div className="settings-rows">
        <button className="settings-row settings-row-action" type="button" onClick={onChooseGoal}>
          <span className="settings-row-copy">
            <strong>هدف یادگیری</strong>
            <small>
              <span>{learnerGoalTitle[goal]}</span>
              <span className="device-local-badge">فقط در این دستگاه</span>
            </small>
          </span>
          <span className="profile-row-arrow" aria-hidden="true">
            ←
          </span>
        </button>
        <div className="settings-row">
          <span className="settings-row-copy">
            <strong>اندازهٔ متن</strong>
            <small>
              از تنظیمات مرورگر یا دستگاه پیروی می‌کند؛ لغزندهٔ جداگانه‌ای در برنامه ندارد.
            </small>
          </span>
        </div>
        <div className="settings-row">
          <span className="settings-row-copy">
            <strong>زبان برنامه</strong>
            <small>فارسی</small>
          </span>
        </div>
      </div>
      <p className="settings-footnote" role="status">
        انتخاب زبان دیگری در این نسخه وجود ندارد؛ واژه‌های آلمانی همان‌طور که هستند نمایش داده
        می‌شوند.
      </p>
    </main>
  );
}
