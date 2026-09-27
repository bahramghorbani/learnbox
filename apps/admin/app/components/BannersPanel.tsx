'use client';
import { useCallback, useEffect, useState } from 'react';

interface Banner {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  background_color: string;
  link_url: string | null;
  link_type: string;
  link_target: string | null;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export function BannersPanel() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Banner> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchBanners = useCallback(async () => {
    try {
      const res = await fetch('/api/banners');
      if (res.ok) {
        const json = await res.json();
        setBanners(json.banners ?? []);
      }
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBanners();
  }, [fetchBanners]);

  const saveBanner = async () => {
    if (!editing || !editing.title) return;
    setSaving(true);
    try {
      const isNew = !editing.id;
      const res = await fetch('/api/banners', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      if (res.ok) {
        setEditing(null);
        fetchBanners();
      }
    } catch {
      /* silent */
    }
    setSaving(false);
  };

  const deleteBanner = async (id: string) => {
    if (!confirm('حذف بنر؟')) return;
    await fetch(`/api/banners?id=${id}`, { method: 'DELETE' });
    fetchBanners();
  };

  const toggleActive = async (banner: Banner) => {
    await fetch('/api/banners', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: banner.id, is_active: !banner.is_active }),
    });
    fetchBanners();
  };

  if (loading) return <div style={{ padding: '2rem', color: '#94a3b8' }}>بارگذاری...</div>;

  return (
    <div style={{ padding: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h2 style={{ color: '#f1f5f9', margin: 0 }}>🖼️ مدیریت بنرها</h2>
        <button
          onClick={() =>
            setEditing({
              title: '',
              description: '',
              background_color: '#6d28d9',
              link_type: 'url',
              sort_order: banners.length,
              is_active: true,
            })
          }
          style={{
            background: '#6d28d9',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '0.5rem 1rem',
            cursor: 'pointer',
          }}
        >
          + بنر جدید
        </button>
      </div>

      {/* Editor */}
      {editing && (
        <div
          style={{
            background: '#1e293b',
            borderRadius: 12,
            padding: '1rem',
            marginBottom: '1rem',
            border: '1px solid #334155',
          }}
        >
          <h3 style={{ color: '#e2e8f0', margin: '0 0 0.75rem' }}>
            {editing.id ? 'ویرایش بنر' : 'بنر جدید'}
          </h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>عنوان *</label>
              <input
                style={inputStyle}
                value={editing.title ?? ''}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="مثلاً: بسته ویژه نوروز"
              />
            </div>
            <div>
              <label style={labelStyle}>توضیحات</label>
              <input
                style={inputStyle}
                value={editing.description ?? ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="یک خط توضیح کوتاه"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={labelStyle}>URL تصویر</label>
                <input
                  style={inputStyle}
                  value={editing.image_url ?? ''}
                  onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label style={labelStyle}>رنگ پس‌زمینه</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={editing.background_color ?? '#6d28d9'}
                    onChange={(e) => setEditing({ ...editing, background_color: e.target.value })}
                    style={{ width: 40, height: 36, border: 'none', cursor: 'pointer' }}
                  />
                  <input
                    style={inputStyle}
                    value={editing.background_color ?? ''}
                    onChange={(e) => setEditing({ ...editing, background_color: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={labelStyle}>نوع لینک</label>
                <select
                  style={inputStyle}
                  value={editing.link_type ?? 'url'}
                  onChange={(e) => setEditing({ ...editing, link_type: e.target.value })}
                >
                  <option value="url">URL خارجی</option>
                  <option value="pack">بسته فروشگاه</option>
                  <option value="screen">صفحه اپ</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>مقصد لینک</label>
                <input
                  style={inputStyle}
                  value={editing.link_url ?? ''}
                  onChange={(e) => setEditing({ ...editing, link_url: e.target.value })}
                  placeholder={editing.link_type === 'pack' ? 'pack_id' : 'https://...'}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={labelStyle}>ترتیب</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={editing.sort_order ?? 0}
                  onChange={(e) =>
                    setEditing({ ...editing, sort_order: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <label style={labelStyle}>شروع</label>
                <input
                  type="datetime-local"
                  style={inputStyle}
                  value={editing.starts_at ? editing.starts_at.slice(0, 16) : ''}
                  onChange={(e) => setEditing({ ...editing, starts_at: e.target.value || null })}
                />
              </div>
              <div>
                <label style={labelStyle}>پایان</label>
                <input
                  type="datetime-local"
                  style={inputStyle}
                  value={editing.ends_at ? editing.ends_at.slice(0, 16) : ''}
                  onChange={(e) => setEditing({ ...editing, ends_at: e.target.value || null })}
                />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button
              onClick={saveBanner}
              disabled={saving}
              style={{
                background: '#22c55e',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '0.5rem 1.5rem',
                cursor: 'pointer',
              }}
            >
              {saving ? 'ذخیره...' : 'ذخیره'}
            </button>
            <button
              onClick={() => setEditing(null)}
              style={{
                background: '#374151',
                color: '#e2e8f0',
                border: 'none',
                borderRadius: 8,
                padding: '0.5rem 1rem',
                cursor: 'pointer',
              }}
            >
              انصراف
            </button>
          </div>
        </div>
      )}

      {/* Banners list */}
      {banners.length === 0 ? (
        <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
          هنوز بنری ساخته نشده
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {banners.map((b) => (
            <div
              key={b.id}
              style={{
                background: '#0f172a',
                borderRadius: 12,
                padding: '0.75rem 1rem',
                border: `1px solid ${b.is_active ? '#334155' : '#1e293b'}`,
                opacity: b.is_active ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  background: b.background_color,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem',
                }}
              >
                {b.image_url ? '🖼️' : '📢'}
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ color: '#e2e8f0', fontSize: '0.9rem' }}>{b.title}</strong>
                {b.description && (
                  <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: '0.15rem 0 0' }}>
                    {b.description}
                  </p>
                )}
                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    marginTop: '0.25rem',
                    fontSize: '0.7rem',
                    color: '#64748b',
                  }}
                >
                  <span>ترتیب: {b.sort_order}</span>
                  <span>نوع: {b.link_type}</span>
                  {b.starts_at && (
                    <span>از: {new Date(b.starts_at).toLocaleDateString('fa-IR')}</span>
                  )}
                  {b.ends_at && <span>تا: {new Date(b.ends_at).toLocaleDateString('fa-IR')}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  onClick={() => toggleActive(b)}
                  style={smallBtnStyle}
                  title={b.is_active ? 'غیرفعال' : 'فعال'}
                >
                  {b.is_active ? '🟢' : '⚪'}
                </button>
                <button onClick={() => setEditing(b)} style={smallBtnStyle}>
                  ✏️
                </button>
                <button onClick={() => deleteBanner(b.id)} style={smallBtnStyle}>
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  color: '#94a3b8',
  marginBottom: '0.2rem',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.4rem 0.6rem',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 6,
  color: '#e2e8f0',
  fontSize: '0.85rem',
};
const smallBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '1rem',
  cursor: 'pointer',
  padding: '0.25rem',
};
