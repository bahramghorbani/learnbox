'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';
import { useState } from 'react';

import { LearnerNav } from './components/LearnerNav';
import { OnboardingGoal } from './components/OnboardingGoal';
import { ProgressScreen } from './components/ProgressScreen';

type Grade = 'forgot' | 'hard' | 'remembered' | 'mastered';

const savedWords = [
  { german: 'das Haus', persian: 'خانه', progress: 72 },
  { german: 'die Zeit', persian: 'زمان', progress: 48 },
  { german: 'lernen', persian: 'یاد گرفتن', progress: 31 },
];

const grades: Array<{ id: Grade; label: string; detail: string }> = [
  { id: 'forgot', label: 'فراموش کردم', detail: 'زودتر دوباره می‌بینیمش.' },
  { id: 'hard', label: 'سخت بود', detail: 'با فاصلهٔ کوتاه‌تری برمی‌گردد.' },
  { id: 'remembered', label: 'یادم آمد', detail: 'آفرین، فاصلهٔ مرور بیشتر می‌شود.' },
  { id: 'mastered', label: 'کاملاً بلد بودم', detail: 'عالیه، این واژه دیرتر برمی‌گردد.' },
];

export default function Home() {
  const [onboarded, setOnboarded] = useState(false);
  const [learningGoal, setLearningGoal] = useState<'life' | 'career' | 'travel'>('life');
  const [wordQuery, setWordQuery] = useState('');
  const [screen, setScreen] = useState<'today' | 'card' | 'complete' | 'progress' | 'words'>(
    'today',
  );
  const [flipped, setFlipped] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const begin = () => {
    setScreen('card');
    setFlipped(false);
    setGrade(null);
  };

  if (!onboarded) {
    return (
      <OnboardingGoal
        selectedGoal={learningGoal}
        onSelectGoal={setLearningGoal}
        onContinue={() => setOnboarded(true)}
      />
    );
  }

  if (screen === 'progress') {
    return (
      <ProgressScreen onStartReview={begin} onNavigate={(destination) => setScreen(destination)} />
    );
  }

  if (screen === 'words') {
    const visibleWords = savedWords.filter((word) =>
      `${word.german} ${word.persian}`.toLocaleLowerCase().includes(wordQuery.toLocaleLowerCase()),
    );
    return (
      <main className="app-shell words-shell" data-testid="learnbox-words">
        <header className="progress-brand">
          <span className="brand">LearnBox</span>
        </header>
        <section className="words-list" aria-labelledby="words-title">
          <h1 id="words-title">واژه‌های من</h1>
          <label className="word-search">
            <span className="sr-only">جست‌وجوی واژه</span>
            <input
              value={wordQuery}
              onChange={(event) => setWordQuery(event.target.value)}
              placeholder="جست‌وجوی واژه"
            />
            <span aria-hidden="true">⌕</span>
          </label>
          <p className="words-count">{visibleWords.length} واژه برای مرور</p>
          <div className="word-rows">
            {visibleWords.map((word) => (
              <button className="word-row" key={word.german} type="button" onClick={begin}>
                <span className="word-meaning">{word.persian}</span>
                <strong lang="de" dir="ltr">
                  {word.german}
                </strong>
                <span
                  className="word-ring"
                  style={{ '--word-progress': `${word.progress}%` } as CSSProperties}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>
        <LearnerNav current="words" onNavigate={(destination) => setScreen(destination)} />
      </main>
    );
  }

  if (screen === 'complete') {
    const response = grades.find((item) => item.id === grade);
    return (
      <main className="app-shell" data-testid="learnbox-app">
        <section className="completion" aria-live="polite">
          <span className="mascot" aria-hidden="true">
            ✦
          </span>
          <p className="eyeline">یک قدم آرام و پیوسته</p>
          <h1>آفرین، ثبت شد.</h1>
          <p>{response?.detail}</p>
          <button className="primary-button" onClick={() => setScreen('today')}>
            بازگشت به امروز
          </button>
        </section>
      </main>
    );
  }

  if (screen === 'card') {
    return (
      <main className="app-shell" data-testid="learnbox-app">
        <header className="session-header">
          <button className="text-button" onClick={() => setScreen('today')}>
            خروج از جلسه
          </button>
          <span>۱ از ۱۲</span>
        </header>
        <div className="session-track" aria-label="پیشرفت جلسه">
          <span />
        </div>
        <section className="study-card">
          {!flipped ? (
            <button
              className="card-face"
              onClick={() => setFlipped(true)}
              aria-label="برگرداندن کارت"
            >
              <span className="article">das</span>
              <h1 lang="de" dir="ltr">
                das Haus
              </h1>
              <span className="audio-mark" aria-hidden="true">
                ◖))
              </span>
              <Image
                src="/images/haus-card.png"
                alt="خانه‌ای با سقف سفالی"
                width={1280}
                height={960}
                priority
              />
              <p className="hint">جایی که زندگی می‌کنیم.</p>
              <span className="flip-hint">برای دیدن معنی، کارت را برگردان</span>
            </button>
          ) : (
            <div className="card-face card-back">
              <button className="flip-again" onClick={() => setFlipped(false)}>
                برگرداندن کارت
              </button>
              <h1>خانه</h1>
              <div className="example" dir="ltr">
                <strong>Ich komme nach Hause.</strong>
                <span dir="rtl">من به خانه برمی‌گردم.</span>
              </div>
              <p className="instruction">چقدر یادت آمد؟</p>
              <div className="grade-grid" role="group" aria-label="درجهٔ یادآوری">
                {grades.map((item) => (
                  <button
                    key={item.id}
                    className={`grade grade-${item.id}`}
                    onClick={() => {
                      setGrade(item.id);
                      setScreen('complete');
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell" data-testid="learnbox-app">
      <header className="brand-row">
        <span className="brand">LearnBox</span>
        <span className="mascot" aria-label="همراه یادگیری">
          ●
        </span>
      </header>
      <section className="today-intro">
        <p className="eyeline">امروز</p>
        <h1>با چند دقیقه شروع کن</h1>
        <p>مرور کوتاه امروز، مسیر یادگیریت را زنده نگه می‌دارد.</p>
      </section>
      <section className="summary" aria-label="پیشنهاد امروز">
        <div>
          <span>مرورهای امروز</span>
          <strong>۲۴</strong>
          <small>منتظر مرور</small>
        </div>
        <div>
          <span>کلمهٔ پیشنهادی</span>
          <strong>۱۲</strong>
          <small>جدید برای یادگیری</small>
        </div>
      </section>
      <button className="primary-button" onClick={begin}>
        شروع مرور <span aria-hidden="true">←</span>
      </button>
      <button className="recovery" onClick={begin}>
        <span aria-hidden="true">↺</span>
        <span>
          <strong>چند روزی از دست رفته؟</strong>از آخرین مرور ادامه بده
        </span>
      </button>
      <section className="progress-note">
        <div className="progress-icon" aria-hidden="true">
          ⌁
        </div>
        <div>
          <h2>پیشرفت امروز</h2>
          <p>هر روز، یک قدم جلوتر</p>
          <div className="progress-bar">
            <span />
          </div>
        </div>
        <span>۳ از ۱۰</span>
      </section>
      <LearnerNav current="today" onNavigate={(destination) => setScreen(destination)} />
    </main>
  );
}
