import { useState, type RefObject } from 'react';

import type { SoundPreferenceDurability } from '../sound-preference';
import { learnerGoalTitle, type LearnerLearningGoal } from './ProfileScreen';

interface SettingsScreenProps {
  goal: LearnerLearningGoal;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  goalRowRef?: RefObject<HTMLButtonElement | null>;
  soundEnabled: boolean;
  onBack: () => void;
  onChooseGoal: () => void;
  onToggleSound: (enabled: boolean) => Promise<SoundPreferenceDurability>;
}

const soundSwitchLabel = 'پخش تلفظ';
const durableSaveStatus = 'تنظیم روی این دستگاه ذخیره شد.';
const sessionOnlySaveStatus =
  'این مرورگر ذخیرهٔ دائمی را اجازه نداد؛ این تنظیم تا پایان این نشست روی این دستگاه می‌ماند.';

// M3-S1 Settings: the versioned device-local pronunciation preference joins the
// existing goal row; text size and language stay truthful informational rows.
export function SettingsScreen({
  goal,
  headingRef,
  goalRowRef,
  soundEnabled,
  onBack,
  onChooseGoal,
  onToggleSound,
}: SettingsScreenProps) {
  const [saveStatus, setSaveStatus] = useState('');

  const handleToggleSound = (enabled: boolean) => {
    void onToggleSound(enabled).then((durability) => {
      setSaveStatus(durability === 'durable' ? durableSaveStatus : sessionOnlySaveStatus);
    });
  };

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
        <div className="settings-row settings-row-switch">
          <label className="settings-switch-control">
            <input
              id="sound-preference-switch"
              className="settings-switch-input"
              type="checkbox"
              role="switch"
              checked={soundEnabled}
              aria-checked={soundEnabled}
              aria-label={soundSwitchLabel}
              onChange={(event) => handleToggleSound(event.target.checked)}
            />
            <span className="settings-row-copy">
              <strong>{soundSwitchLabel}</strong>
              <small>
                <span className="device-local-badge">روی این دستگاه</span>
              </small>
            </span>
            <span className="settings-switch-track" aria-hidden="true" />
          </label>
        </div>
        <button
          className="settings-row settings-row-action"
          type="button"
          ref={goalRowRef}
          onClick={onChooseGoal}
        >
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
      <p className="settings-save-status" role="status">
        {saveStatus}
      </p>
      <p className="settings-footnote">
        انتخاب زبان دیگری در این نسخه وجود ندارد؛ واژه‌های آلمانی همان‌طور که هستند نمایش داده
        می‌شوند.
      </p>
    </main>
  );
}
