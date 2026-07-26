'use client';

import type { ReactNode } from 'react';

type GoalId = 'life' | 'career' | 'travel';

interface OnboardingGoalProps {
  selectedGoal: GoalId;
  onSelectGoal: (goal: GoalId) => void;
  onContinue: () => void;
}

const goals: Array<{ id: GoalId; title: string; description: string; icon: ReactNode }> = [
  {
    id: 'life',
    title: 'زندگی در آلمان',
    description: 'برای کارهای روزمره و ارتباط',
    icon: <HomeIcon />,
  },
  {
    id: 'career',
    title: 'کار و دانشگاه',
    description: 'برای مسیر حرفه‌ای و تحصیلی',
    icon: <CareerIcon />,
  },
  {
    id: 'travel',
    title: 'سفر و ارتباط',
    description: 'برای موقعیت‌های واقعی',
    icon: <TravelIcon />,
  },
];

export function OnboardingGoal({ selectedGoal, onSelectGoal, onContinue }: OnboardingGoalProps) {
  return (
    <main className="app-shell onboarding-shell" data-testid="learnbox-onboarding">
      <header className="onboarding-brand">
        <span className="brand">LearnBox</span>
        <span className="brand-orbit" aria-hidden="true">
          <i />
        </span>
      </header>
      <section className="onboarding-intro" aria-labelledby="onboarding-title">
        <h1 id="onboarding-title">برای چه چیزی آلمانی می‌خوانی؟</h1>
        <p>هدف تو کمک می‌کند برنامهٔ امروزت متناسب باشد.</p>
      </section>
      <div className="goal-list" role="radiogroup" aria-label="هدف یادگیری">
        {goals.map((goal) => {
          const selected = goal.id === selectedGoal;
          return (
            <button
              key={goal.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`goal-option ${selected ? 'goal-option-selected' : ''}`}
              onClick={() => onSelectGoal(goal.id)}
            >
              <span className="goal-radio" aria-hidden="true">
                {selected ? '✓' : ''}
              </span>
              <span className="goal-copy">
                <strong>{goal.title}</strong>
                <small>{goal.description}</small>
              </span>
              <span className="goal-icon" aria-hidden="true">
                {goal.icon}
              </span>
            </button>
          );
        })}
      </div>
      <div className="onboarding-actions">
        <button className="primary-button" type="button" onClick={onContinue}>
          ادامه
        </button>
        <button className="skip-button" type="button" onClick={onContinue}>
          عبور از این مرحله
        </button>
      </div>
    </main>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none">
      <path
        d="m7 22 17-14 17 14v18H7V22Z"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <path
        d="M18 40V27h12v13M15 22h.01M33 22h.01"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CareerIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none">
      <path
        d="M9 18h30v21H9V18ZM17 18v-4c0-2.2 1.8-4 4-4h6c2.2 0 4 1.8 4 4v4"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 27h30M21 27h6v4h-6z"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TravelIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none">
      <path
        d="M16 13h16v27H16zM20 13V9h8v4M21 20h6M21 27h6M21 34h6"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m35 12 8-4-3 8 3 5-8-2-5 4 2-8-4-4 7 1Z" fill="currentColor" />
    </svg>
  );
}
