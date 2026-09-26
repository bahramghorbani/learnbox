import { useCallback, useEffect, useState } from 'react';
import { LearnerNav, type LearnerDestination } from './LearnerNav';
import { toPersianDigits } from '../persian-digits';

type Pack = {
  id: string;
  display_name: string;
  description: string;
  target_cefr: string;
  target_item_count: number;
  category: string;
  is_free: boolean;
  price_tomans: number | null;
  card_count: string;
  published_at: string;
};

type PackDetail = Pack & {
  sampleCards: Array<{ lemma: string; article: string; part_of_speech: string; cefr_level: string }>;
  totalCards: number;
};

type UserPack = {
  pack_id: string;
  acquired_at: string;
  acquisition_type: string;
  display_name: string;
  total_cards: string;
  learned_cards: string;
};

const categoryLabels: Record<string, string> = {
  essentials: 'ضروری‌ها',
  travel: 'سفر و گردشگری',
  work: 'کار و دانشگاه',
  advanced: 'پیشرفته',
};

const cefrColors: Record<string, string> = {
  A1: '#4CAF50', A2: '#8BC34A', B1: '#FF9800', B2: '#FF5722', C1: '#9C27B0', C2: '#673AB7',
};

export function StoreScreen({
  onNavigate,
}: {
  onNavigate: (dest: LearnerDestination) => void;
}) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [myPacks, setMyPacks] = useState<UserPack[]>([]);
  const [selectedPack, setSelectedPack] = useState<PackDetail | null>(null);
  const [category, setCategory] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState('');

  const loadPacks = useCallback(async () => {
    setLoading(true);
    try {
      const url = category ? `/api/store/packs?category=${category}` : '/api/store/packs';
      const [packsRes, myRes] = await Promise.all([
        fetch(url, { credentials: 'same-origin' }),
        fetch('/api/store/my-packs', { credentials: 'same-origin' }),
      ]);
      if (packsRes.ok) {
        const data = await packsRes.json();
        setPacks(data.packs || []);
      }
      if (myRes.ok) {
        const data = await myRes.json();
        setMyPacks(data.packs || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { void loadPacks(); }, [loadPacks]);

  const loadPackDetail = async (packId: string) => {
    try {
      const res = await fetch(`/api/store/packs?id=${packId}`, { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        setSelectedPack({ ...data.pack, sampleCards: data.sampleCards, totalCards: data.totalCards });
      }
    } catch {
      // silent
    }
  };

  const activatePack = async (packId: string) => {
    setActivating(true);
    setMessage('');
    try {
      const res = await fetch('/api/store/activate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.status === 'already_active' ? 'این بسته قبلاً فعال شده!' : 'بسته با موفقیت فعال شد! ✅');
        void loadPacks();
        setSelectedPack(null);
      } else {
        setMessage('خطا در فعال‌سازی. دوباره تلاش کنید.');
      }
    } catch {
      setMessage('ارتباط با سرور برقرار نشد.');
    } finally {
      setActivating(false);
    }
  };

  const isOwned = (packId: string) => myPacks.some(p => p.pack_id === packId);

  const formatPrice = (pack: Pack) => {
    if (pack.is_free) return 'رایگان';
    if (pack.price_tomans) return toPersianDigits(pack.price_tomans) + ' تومان';
    return 'به‌زودی';
  };

  // Pack detail view
  if (selectedPack) {
    return (
      <div className="store-screen">
        <div className="store-detail">
          <button className="store-back-btn" onClick={() => setSelectedPack(null)}>→ بازگشت</button>
          <div className="store-detail-header">
            <h2>{selectedPack.display_name}</h2>
            <span className="store-cefr-badge" style={{ background: cefrColors[selectedPack.target_cefr] || '#666' }}>
              {selectedPack.target_cefr}
            </span>
          </div>
          {selectedPack.description && <p className="store-detail-desc">{selectedPack.description}</p>}
          <div className="store-detail-meta">
            <span>📦 {toPersianDigits(selectedPack.totalCards)} کارت</span>
            <span>🏷️ {categoryLabels[selectedPack.category] || selectedPack.category}</span>
            <span className="store-price">{formatPrice(selectedPack)}</span>
          </div>

          {selectedPack.sampleCards.length > 0 && (
            <div className="store-samples">
              <h3>نمونه کلمات</h3>
              <ul>
                {selectedPack.sampleCards.map((c, i) => (
                  <li key={i}>
                    <span className="store-sample-word">{c.article ? `${c.article} ${c.lemma}` : c.lemma}</span>
                    <span className="store-sample-pos">{c.part_of_speech}</span>
                    <span className="store-sample-cefr">{c.cefr_level}</span>
                  </li>
                ))}
              </ul>
              <p className="store-samples-hint">
                و {toPersianDigits(Math.max(0, selectedPack.totalCards - 5))} کلمه دیگر...
              </p>
            </div>
          )}

          {isOwned(selectedPack.id) ? (
            <div className="store-owned-badge">✅ این بسته فعال است</div>
          ) : selectedPack.is_free ? (
            <button
              className="store-activate-btn"
              onClick={() => void activatePack(selectedPack.id)}
              disabled={activating}
            >
              {activating ? 'در حال فعال‌سازی...' : '🎁 فعال‌سازی رایگان'}
            </button>
          ) : selectedPack.price_tomans ? (
            <button className="store-buy-btn" disabled>
              🔒 خرید — {formatPrice(selectedPack)} (به‌زودی)
            </button>
          ) : (
            <button className="store-buy-btn" disabled>به‌زودی</button>
          )}

          {message && <p className="store-message" role="status">{message}</p>}
        </div>
        <LearnerNav current="store" onNavigate={onNavigate} />
      </div>
    );
  }

  // Main store view
  return (
    <div className="store-screen">
      <div className="store-header">
        <h1>🏪 فروشگاه</h1>
        <p>بسته‌های آموزشی زبان آلمانی</p>
      </div>

      {/* Category filter */}
      <div className="store-filters">
        <button className={`store-filter-btn ${!category ? 'active' : ''}`} onClick={() => setCategory('')}>همه</button>
        {Object.entries(categoryLabels).map(([key, label]) => (
          <button key={key} className={`store-filter-btn ${category === key ? 'active' : ''}`} onClick={() => setCategory(key)}>
            {label}
          </button>
        ))}
      </div>

      {message && <p className="store-message" role="status">{message}</p>}

      {loading ? (
        <div className="store-loading">در حال بارگذاری...</div>
      ) : packs.length === 0 ? (
        <div className="store-empty">بسته‌ای در این دسته‌بندی یافت نشد.</div>
      ) : (
        <div className="store-pack-list">
          {packs.map(pack => {
            const owned = isOwned(pack.id);
            return (
              <button key={pack.id} className={`store-pack-card ${owned ? 'owned' : ''}`} onClick={() => void loadPackDetail(pack.id)}>
                <div className="store-pack-top">
                  <span className="store-cefr-badge" style={{ background: cefrColors[pack.target_cefr] || '#666' }}>
                    {pack.target_cefr}
                  </span>
                  {owned && <span className="store-owned-tag">✅ فعال</span>}
                </div>
                <h3>{pack.display_name}</h3>
                {pack.description && <p>{pack.description}</p>}
                <div className="store-pack-footer">
                  <span>📦 {toPersianDigits(Number(pack.card_count) || pack.target_item_count)} کارت</span>
                  <span className={`store-price ${pack.is_free ? 'free' : ''}`}>{formatPrice(pack)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Plus banner */}
      <div className="store-plus-banner">
        <div className="store-plus-icon">⭐</div>
        <div>
          <h3>LearnBox Plus</h3>
          <p>اشتراک ویژه با دسترسی نامحدود — به‌زودی</p>
        </div>
      </div>

      <LearnerNav current="store" onNavigate={onNavigate} />
    </div>
  );
}
