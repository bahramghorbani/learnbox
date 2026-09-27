import { useCallback, useEffect, useState } from 'react';
import { LearnerNav, type LearnerDestination } from './LearnerNav';
import { toPersianDigits } from '../persian-digits';

interface WordPack {
  id: string;
  title: string;
  slug: string;
}

interface WordItem {
  cardId: string;
  german: string;
  persian: string;
  cefrLevel: string | null;
  packId: string;
  packTitle: string;
  box: number;
  boxLabel: string;
  boxColor: string;
  state: string;
  stabilityDays: number;
  reviewCount: number;
  forgotCount: number;
  dueAt: string | null;
  lastReviewedAt: string | null;
}

interface WordsSummary {
  total: number;
  mastered: number;
  learning: number;
  new: number;
}

type SortMode = 'weakest' | 'alphabetical' | 'last-review' | 'next-review';

const SORT_OPTIONS: Array<{ id: SortMode; label: string }> = [
  { id: 'weakest', label: 'ضعیف‌ترین' },
  { id: 'alphabetical', label: 'الفبایی' },
  { id: 'last-review', label: 'آخرین مرور' },
  { id: 'next-review', label: 'مرور بعدی' },
];

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'هنوز مرور نشده';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'همین الان';
  if (minutes < 60) return toPersianDigits(minutes) + ' دقیقه پیش';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return toPersianDigits(hours) + ' ساعت پیش';
  const days = Math.floor(hours / 24);
  if (days === 1) return 'دیروز';
  return toPersianDigits(days) + ' روز پیش';
}

function timeUntil(dateStr: string | null): string {
  if (!dateStr) return 'نامشخص';
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'آماده مرور';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return toPersianDigits(minutes) + ' دقیقه دیگه';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return toPersianDigits(hours) + ' ساعت دیگه';
  const days = Math.floor(hours / 24);
  return toPersianDigits(days) + ' روز دیگه';
}

function sortWords(words: WordItem[], mode: SortMode): WordItem[] {
  const sorted = [...words];
  switch (mode) {
    case 'weakest':
      sorted.sort((a, b) => a.box - b.box || a.stabilityDays - b.stabilityDays);
      break;
    case 'alphabetical':
      sorted.sort((a, b) => a.german.localeCompare(b.german, 'de'));
      break;
    case 'last-review':
      sorted.sort((a, b) => {
        if (!a.lastReviewedAt && !b.lastReviewedAt) return 0;
        if (!a.lastReviewedAt) return 1;
        if (!b.lastReviewedAt) return -1;
        return new Date(b.lastReviewedAt).getTime() - new Date(a.lastReviewedAt).getTime();
      });
      break;
    case 'next-review':
      sorted.sort((a, b) => {
        if (!a.dueAt && !b.dueAt) return 0;
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      });
      break;
  }
  return sorted;
}

interface WordsScreenProps {
  onNavigate: (destination: LearnerDestination) => void;
  onStartReview: () => void;
}

export function WordsScreen({ onNavigate, onStartReview }: WordsScreenProps) {
  const [packs, setPacks] = useState<WordPack[]>([]);
  const [words, setWords] = useState<WordItem[]>([]);
  const [summary, setSummary] = useState<WordsSummary>({
    total: 0,
    mastered: 0,
    learning: 0,
    new: 0,
  });
  const [loading, setLoading] = useState(true);
  const [packFilter, setPackFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('weakest');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWord, setSelectedWord] = useState<WordItem | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const fetchWords = useCallback(async (pack?: string | null) => {
    setLoading(true);
    try {
      const url = pack ? `/api/learner/words?pack=${pack}` : '/api/learner/words';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        console.log(
          '[words] API response:',
          json.words?.length,
          'words,',
          json.packs?.length,
          'packs',
        );
        setPacks(json.packs ?? []);
        setWords(json.words ?? []);
        setSummary(json.summary ?? { total: 0, mastered: 0, learning: 0, new: 0 });
      } else {
        console.error('[words] API error:', res.status);
      }
    } catch (err) {
      console.error('[words] fetch error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchWords(packFilter);
  }, [fetchWords, packFilter]);

  const query = searchQuery.toLocaleLowerCase();
  const filteredWords = query
    ? words.filter((w) => `${w.german} ${w.persian}`.toLocaleLowerCase().includes(query))
    : words;
  const sortedWords = sortWords(filteredWords, sortMode);
  const progressPercent =
    summary.total > 0 ? Math.round((summary.mastered / summary.total) * 100) : 0;

  return (
    <main className="app-shell words-shell" data-testid="learnbox-words-v2">
      <header className="progress-brand">
        <span className="brand">LearnBox</span>
      </header>

      <section className="words-v2-content">
        {/* Header with progress */}
        <div className="words-v2-header">
          <h1>واژه‌های من</h1>
          <div className="words-v2-progress-bar">
            <div className="words-v2-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="words-v2-progress-text">
            {toPersianDigits(summary.mastered)} از {toPersianDigits(summary.total)} واژه مسلط شده (
            {toPersianDigits(progressPercent)}٪)
          </p>
          <div className="words-v2-summary-chips">
            <span className="words-chip words-chip-new">جدید: {toPersianDigits(summary.new)}</span>
            <span className="words-chip words-chip-learning">
              یادگیری: {toPersianDigits(summary.learning)}
            </span>
            <span className="words-chip words-chip-mastered">
              مسلط: {toPersianDigits(summary.mastered)}
            </span>
          </div>
        </div>

        {/* Pack filter tabs */}
        {packs.length > 0 && (
          <div className="words-v2-pack-tabs" role="tablist">
            <button
              className="words-pack-tab"
              role="tab"
              aria-selected={packFilter === null}
              onClick={() => setPackFilter(null)}
            >
              همه ({toPersianDigits(summary.total)})
            </button>
            {packs.map((pack) => (
              <button
                key={pack.id}
                className="words-pack-tab"
                role="tab"
                aria-selected={packFilter === pack.id}
                onClick={() => setPackFilter(pack.id)}
              >
                {pack.title}
              </button>
            ))}
          </div>
        )}

        {/* Search + Sort */}
        <div className="words-v2-controls">
          <label className="words-v2-search">
            <span className="sr-only">جست‌وجوی واژه</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جست‌وجوی واژه..."
            />
            <span aria-hidden="true">⌕</span>
          </label>
          <div className="words-v2-sort-wrapper">
            <button
              className="words-v2-sort-btn"
              onClick={() => setShowSortMenu(!showSortMenu)}
              aria-expanded={showSortMenu}
            >
              مرتب‌سازی: {SORT_OPTIONS.find((o) => o.id === sortMode)?.label}
            </button>
            {showSortMenu && (
              <div className="words-v2-sort-menu">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    className="words-sort-option"
                    aria-pressed={sortMode === opt.id}
                    onClick={() => {
                      setSortMode(opt.id);
                      setShowSortMenu(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Word count */}
        <p className="words-v2-count">{toPersianDigits(sortedWords.length)} واژه</p>

        {/* Word list */}
        {loading ? (
          <div className="words-v2-loading">در حال بارگذاری...</div>
        ) : sortedWords.length === 0 ? (
          <div className="words-v2-empty">
            {searchQuery ? 'واژه‌ای پیدا نشد.' : 'هنوز واژه‌ای فعال نشده.'}
          </div>
        ) : (
          <div className="words-v2-list">
            {sortedWords.map((word) => (
              <button
                key={word.cardId}
                className="words-v2-row"
                type="button"
                onClick={() => setSelectedWord(word)}
              >
                <span className="words-v2-box-badge" style={{ background: word.boxColor }}>
                  {word.box === 0 ? '✦' : toPersianDigits(word.box)}
                </span>
                <span className="words-v2-word-info">
                  <strong className="words-v2-german" lang="de" dir="ltr">
                    {word.german}
                  </strong>
                  <span className="words-v2-persian">{word.persian}</span>
                </span>
                <span className="words-v2-meta">
                  <span className="words-v2-box-label">{word.boxLabel}</span>
                  <span className="words-v2-due">
                    {word.state === 'new' ? 'جدید' : timeUntil(word.dueAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Word detail modal */}
      {selectedWord && (
        <div
          className="words-v2-modal-overlay"
          onClick={() => setSelectedWord(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`جزئیات ${selectedWord.german}`}
        >
          <div className="words-v2-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="words-v2-modal-close"
              onClick={() => setSelectedWord(null)}
              aria-label="بستن"
            >
              ✕
            </button>
            <div className="words-v2-modal-header">
              <span
                className="words-v2-modal-box-badge"
                style={{ background: selectedWord.boxColor }}
              >
                {selectedWord.box === 0 ? '✦' : toPersianDigits(selectedWord.box)}
              </span>
              <h2 className="words-v2-modal-german" lang="de" dir="ltr">
                {selectedWord.german}
              </h2>
              <p className="words-v2-modal-persian">{selectedWord.persian}</p>
            </div>

            <div className="words-v2-modal-stats">
              <div className="words-v2-stat-row">
                <span className="words-v2-stat-icon">📦</span>
                <span>
                  جعبه {selectedWord.box === 0 ? '—' : toPersianDigits(selectedWord.box)} از ۵
                </span>
                <span className="words-v2-stat-value">{selectedWord.boxLabel}</span>
              </div>
              <div className="words-v2-stat-row">
                <span className="words-v2-stat-icon">🔄</span>
                <span>تعداد مرور</span>
                <span className="words-v2-stat-value">
                  {toPersianDigits(selectedWord.reviewCount)} بار
                </span>
              </div>
              <div className="words-v2-stat-row">
                <span className="words-v2-stat-icon">❌</span>
                <span>فراموش شده</span>
                <span className="words-v2-stat-value">
                  {toPersianDigits(selectedWord.forgotCount)} بار
                </span>
              </div>
              <div className="words-v2-stat-row">
                <span className="words-v2-stat-icon">📅</span>
                <span>آخرین مرور</span>
                <span className="words-v2-stat-value">{timeAgo(selectedWord.lastReviewedAt)}</span>
              </div>
              <div className="words-v2-stat-row">
                <span className="words-v2-stat-icon">⏰</span>
                <span>مرور بعدی</span>
                <span className="words-v2-stat-value">
                  {selectedWord.state === 'new' ? 'هنوز شروع نشده' : timeUntil(selectedWord.dueAt)}
                </span>
              </div>
              {selectedWord.cefrLevel && (
                <div className="words-v2-stat-row">
                  <span className="words-v2-stat-icon">📐</span>
                  <span>سطح</span>
                  <span className="words-v2-stat-value">{selectedWord.cefrLevel}</span>
                </div>
              )}
              <div className="words-v2-stat-row">
                <span className="words-v2-stat-icon">📂</span>
                <span>منبع</span>
                <span className="words-v2-stat-value">{selectedWord.packTitle}</span>
              </div>
            </div>

            <button
              className="words-v2-modal-review-btn"
              onClick={() => {
                setSelectedWord(null);
                onStartReview();
              }}
            >
              🔄 مرور همین الان
            </button>
          </div>
        </div>
      )}

      <LearnerNav current="words" onNavigate={onNavigate} />
    </main>
  );
}
