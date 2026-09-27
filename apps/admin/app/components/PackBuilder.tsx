'use client';

import React, { useCallback, useEffect, useState } from 'react';

type Pack = {
  id: string;
  display_name: string;
  description: string | null;
  locale: string;
  target_cefr: string;
  target_item_count: number;
  category: string | null;
  is_free: boolean;
  price_tomans: number | null;
  status: string;
  ai_prompt: string | null;
  created_at: string;
  published_at: string | null;
  card_count: string;
};

type GeneratedCard = {
  id: string;
  lemma: string;
  content_id: string;
  persian_meanings: string[];
};

const statusLabels: Record<string, string> = {
  draft: 'پیش‌نویس',
  ai_generated: 'تولید شده با AI',
  needs_review: 'نیاز به بررسی',
  approved: 'تأیید شده',
  published: 'منتشر شده',
};

const cefrOptions = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function PackBuilder() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generationResult, setGenerationResult] = useState<{
    packId: string;
    cards: GeneratedCard[];
  } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [importingPack, setImportingPack] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<{
    packId: string;
    total: number;
    valid: number;
    duplicates: number;
    errors: number;
    cards: {
      lemma: string;
      meanings: string[];
      errors: string[];
      duplicate: boolean;
      row: number;
      article: string | null;
      part_of_speech: string;
      cefr: string;
      example_de: string | null;
      example_fa: string | null;
    }[];
  } | null>(null);
  const [importResult, setImportResult] = useState<{ packId: string; count: number } | null>(null);

  // Create form state
  const [newPack, setNewPack] = useState({
    display_name: '',
    description: '',
    target_cefr: 'A1',
    target_item_count: 50,
    category: '',
    is_free: false,
    price_tomans: '',
    ai_prompt: '',
  });

  const fetchPacks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/packs', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('خطا');
      const data = await res.json();
      setPacks(data.packs);
      setError(null);
    } catch {
      setError('خطا در دریافت لیست بسته‌ها');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPacks();
  }, [fetchPacks]);

  async function createPack(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/packs', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newPack,
          price_tomans: newPack.price_tomans ? Number(newPack.price_tomans) : null,
        }),
      });
      if (!res.ok) throw new Error('خطا در ساخت بسته');
      setShowCreate(false);
      setNewPack({
        display_name: '',
        description: '',
        target_cefr: 'A1',
        target_item_count: 50,
        category: '',
        is_free: false,
        price_tomans: '',
        ai_prompt: '',
      });
      void fetchPacks();
    } catch {
      setError('خطا در ساخت بسته');
    }
  }

  async function generateCards(packId: string) {
    setGenerating(packId);
    setGenerationResult(null);
    try {
      const res = await fetch('/api/packs/generate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_id: packId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'خطا در تولید محتوا');
        return;
      }
      setGenerationResult({ packId, cards: data.cards });
      void fetchPacks();
    } catch {
      setError('خطا در ارتباط با سرور');
    } finally {
      setGenerating(null);
    }
  }

  async function publishPack(packId: string) {
    try {
      const res = await fetch('/api/packs', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_id: packId, status: 'published' }),
      });
      if (!res.ok) throw new Error('خطا');
      void fetchPacks();
    } catch {
      setError('خطا در انتشار بسته');
    }
  }

  async function handleCSVUpload(packId: string, file: File) {
    setImportPreview(null);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('pack_id', packId);
      const res = await fetch('/api/packs/import', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'خطا در پردازش فایل');
        return;
      }
      setImportPreview({ ...data, packId });
    } catch {
      setError('خطا در آپلود فایل');
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    try {
      const validCards = importPreview.cards.filter((c) => c.errors.length === 0 && !c.duplicate);
      const res = await fetch('/api/packs/import', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pack_id: importPreview.packId,
          cards: validCards,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'خطا در ذخیره');
        return;
      }
      setImportResult({ packId: importPreview.packId, count: data.imported });
      setImportPreview(null);
      setImportingPack(null);
      void fetchPacks();
    } catch {
      setError('خطا در ذخیره‌سازی');
    }
  }

  if (loading)
    return (
      <div className="pack-builder">
        <p>در حال بارگذاری...</p>
      </div>
    );

  return (
    <div className="pack-builder">
      <div className="pack-header">
        <h2>🏗️ سازنده بسته‌های آموزشی</h2>
        <button className="pack-btn pack-btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? '✕ انصراف' : '➕ بسته جدید'}
        </button>
      </div>

      {error && (
        <div className="pack-error">
          {error} <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {showCreate && (
        <form className="pack-create-form" onSubmit={createPack}>
          <h3>ساخت بسته جدید</h3>
          <div className="pack-form-grid">
            <label>
              نام بسته
              <input
                type="text"
                required
                value={newPack.display_name}
                onChange={(e) => setNewPack({ ...newPack, display_name: e.target.value })}
                placeholder="مثال: کلمات سفر و گردشگری B1"
              />
            </label>
            <label>
              توضیحات
              <input
                type="text"
                value={newPack.description}
                onChange={(e) => setNewPack({ ...newPack, description: e.target.value })}
                placeholder="توضیح کوتاه فارسی"
              />
            </label>
            <label>
              سطح CEFR
              <select
                value={newPack.target_cefr}
                onChange={(e) => setNewPack({ ...newPack, target_cefr: e.target.value })}
              >
                {cefrOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              تعداد کلمات
              <input
                type="number"
                min={10}
                max={500}
                required
                value={newPack.target_item_count}
                onChange={(e) =>
                  setNewPack({ ...newPack, target_item_count: Number(e.target.value) })
                }
              />
            </label>
            <label>
              دسته‌بندی
              <input
                type="text"
                value={newPack.category}
                onChange={(e) => setNewPack({ ...newPack, category: e.target.value })}
                placeholder="مثال: travel, food, business"
              />
            </label>
            <label>
              قیمت (تومان)
              <input
                type="number"
                value={newPack.price_tomans}
                onChange={(e) => setNewPack({ ...newPack, price_tomans: e.target.value })}
                placeholder="خالی = رایگان"
              />
            </label>
            <label className="pack-checkbox-label">
              <input
                type="checkbox"
                checked={newPack.is_free}
                onChange={(e) => setNewPack({ ...newPack, is_free: e.target.checked })}
              />
              رایگان
            </label>
          </div>
          <label className="pack-prompt-label">
            دستور AI (پرامپت)
            <textarea
              value={newPack.ai_prompt}
              onChange={(e) => setNewPack({ ...newPack, ai_prompt: e.target.value })}
              placeholder="مثال: کلمات مربوط به فرودگاه، هتل، رستوران و حمل‌ونقل عمومی. کلمات روزمره و کاربردی باشند."
              rows={3}
            />
          </label>
          <button className="pack-btn pack-btn-primary" type="submit">
            ساخت بسته
          </button>
        </form>
      )}

      <div className="pack-list">
        {packs.length === 0 ? (
          <p className="pack-empty">هنوز بسته‌ای ساخته نشده</p>
        ) : (
          packs.map((pack) => (
            <div key={pack.id} className={`pack-card ${pack.status}`}>
              <div className="pack-card-header">
                <h3>{pack.display_name}</h3>
                <span className={`pack-status pack-status-${pack.status}`}>
                  {statusLabels[pack.status] ?? pack.status}
                </span>
              </div>
              {pack.description && <p className="pack-desc">{pack.description}</p>}
              <div className="pack-meta">
                <span>
                  📚 {pack.card_count}/{pack.target_item_count} کلمه
                </span>
                <span>🎯 {pack.target_cefr}</span>
                <span>
                  {pack.is_free
                    ? '🆓 رایگان'
                    : pack.price_tomans
                      ? `💰 ${Number(pack.price_tomans).toLocaleString('fa-IR')} تومان`
                      : '💰 قیمت‌گذاری نشده'}
                </span>
                <span>📅 {new Date(pack.created_at).toLocaleDateString('fa-IR')}</span>
              </div>
              {pack.ai_prompt && (
                <details className="pack-prompt-details">
                  <summary>پرامپت AI</summary>
                  <p>{pack.ai_prompt}</p>
                </details>
              )}
              <div className="pack-actions">
                {pack.status === 'draft' && (
                  <button
                    className="pack-btn pack-btn-ai"
                    onClick={() => generateCards(pack.id)}
                    disabled={generating === pack.id}
                  >
                    {generating === pack.id ? '⏳ در حال تولید...' : '🤖 تولید با AI'}
                  </button>
                )}
                <label className="pack-btn pack-btn-import">
                  📄 وارد کردن CSV
                  <input
                    type="file"
                    accept=".csv"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleCSVUpload(pack.id, f);
                      e.target.value = '';
                    }}
                  />
                </label>
                <a className="pack-btn pack-btn-template" href="/api/packs?template=csv" download>
                  ⬇️ دانلود قالب
                </a>
                {(pack.status === 'ai_generated' ||
                  pack.status === 'approved' ||
                  pack.status === 'needs_review') && (
                  <button
                    className="pack-btn pack-btn-publish"
                    onClick={() => publishPack(pack.id)}
                  >
                    📢 انتشار
                  </button>
                )}
                {pack.status !== 'draft' && Number(pack.card_count) < pack.target_item_count && (
                  <button
                    className="pack-btn pack-btn-ai"
                    onClick={() => generateCards(pack.id)}
                    disabled={generating === pack.id}
                  >
                    {generating === pack.id
                      ? '⏳ ...'
                      : `🤖 تکمیل (${pack.target_item_count - Number(pack.card_count)} مانده)`}
                  </button>
                )}
              </div>

              {importPreview?.packId === pack.id && (
                <div className="csv-preview">
                  <h4>📋 پیش‌نمایش وارد کردن</h4>
                  <div className="csv-stats">
                    <span className="csv-stat-valid">✅ {importPreview.valid} معتبر</span>
                    {importPreview.duplicates > 0 && (
                      <span className="csv-stat-dup">⚠️ {importPreview.duplicates} تکراری</span>
                    )}
                    {importPreview.errors > 0 && (
                      <span className="csv-stat-err">❌ {importPreview.errors} خطا</span>
                    )}
                  </div>
                  <div className="csv-cards-list">
                    {importPreview.cards.map((c, i) => (
                      <div
                        key={i}
                        className={`csv-card-row ${c.errors.length ? 'has-error' : ''} ${c.duplicate ? 'is-dup' : ''}`}
                      >
                        <span className="csv-row-num">{c.row}</span>
                        <strong>{c.lemma}</strong>
                        <span className="csv-meanings">{c.meanings.join('، ')}</span>
                        <span className="csv-cefr">{c.cefr}</span>
                        {c.duplicate && <span className="csv-badge csv-badge-dup">تکراری</span>}
                        {c.errors.map((e, j) => (
                          <span key={j} className="csv-badge csv-badge-err">
                            {e}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="csv-actions">
                    <button
                      className="pack-btn pack-btn-primary"
                      onClick={confirmImport}
                      disabled={importPreview.valid === 0}
                    >
                      ✅ تأیید و ذخیره {importPreview.valid} کلمه
                    </button>
                    <button className="pack-btn" onClick={() => setImportPreview(null)}>
                      انصراف
                    </button>
                  </div>
                </div>
              )}

              {importResult?.packId === pack.id && (
                <div className="pack-generation-result">
                  <h4>✅ {importResult.count} کلمه وارد شد</h4>
                </div>
              )}

              {generationResult?.packId === pack.id && (
                <div className="pack-generation-result">
                  <h4>✅ {generationResult.cards.length} کلمه تولید شد</h4>
                  <div className="generated-cards-preview">
                    {generationResult.cards.map((c) => (
                      <div key={c.id} className="generated-card-item">
                        <strong>{c.lemma}</strong>
                        <span>{c.persian_meanings.join('، ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
