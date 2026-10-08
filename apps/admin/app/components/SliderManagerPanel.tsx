'use client';

import { startAuthentication } from '@simplewebauthn/browser';
import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Phase 4 / Milestone 4.2 — the Admin Slider Manager.
 *
 * One panel for the whole home-screen slider: the existing slides, their state, and the single form
 * that creates or edits one of them. Creating, editing, activating and deactivating are the same
 * request, because they are the same fact — the state of one slide — and the server enforces the
 * rules either way. The panel validates locally only to spare the operator a round trip; the
 * maximum of three active slides, the destination allowlist and the image requirement are all
 * enforced again in the database transaction.
 */

type SlideDestination =
  | { kind: 'screen'; screen: string }
  | { kind: 'pack'; packId: string }
  | { kind: 'url'; url: string };

type Slide = {
  id: string;
  title: string;
  description: string | null;
  destination?: SlideDestination;
  isActive: boolean;
  sortOrder: number;
  hasImage: boolean;
  legacyImageUrl: string | null;
};

type Draft = {
  slideId?: string;
  title: string;
  description: string;
  kind: 'screen' | 'pack' | 'url';
  screen: string;
  packId: string;
  url: string;
  isActive: boolean;
};

type PendingAction =
  | { kind: 'upsert'; key: string; draft: Draft; file?: File }
  | { kind: 'reorder'; key: string; order: string[] };

type PanelState =
  'loading' | 'idle' | 'saving' | 'reauth-required' | 'reauthenticating' | 'saved' | 'error';

const screenLabels: Record<string, string> = {
  today: 'امروز',
  words: 'واژه‌ها',
  progress: 'پیشرفت',
  profile: 'پروفایل',
  store: 'فروشگاه',
};

const acceptedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const maximumBytes = 6 * 1024 * 1024;

const rejectionMessages: Record<string, string> = {
  file_too_large: 'حجم تصویر بیشتر از ۶ مگابایت است.',
  invalid_image: 'فایل انتخاب‌شده تصویر معتبری نیست.',
  animated_image: 'تصویر متحرک پذیرفته نمی‌شود.',
  dimensions_too_small: 'ابعاد تصویر کمتر از ۷۲۰×۲۴۰ است.',
  aspect_ratio_invalid: 'نسبت ابعاد تصویر برای اسلاید مناسب نیست (باید افقی باشد).',
};

const emptyDraft: Draft = {
  title: '',
  description: '',
  kind: 'screen',
  screen: 'today',
  packId: '',
  url: '',
  isActive: false,
};

function readBrowserCookie(name: string) {
  const prefix = `${name}=`;
  return document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function localFileError(file: File) {
  if (!acceptedTypes.has(file.type)) return 'فرمت فایل قابل قبول نیست.';
  if (file.size <= 0) return 'فایل انتخاب‌شده خالی است.';
  if (file.size > maximumBytes) return rejectionMessages.file_too_large;
  return undefined;
}

function describeDestination(slide: Slide) {
  if (!slide.destination) return 'بدون مقصد قانونی';
  if (slide.destination.kind === 'screen') {
    return `صفحهٔ ${screenLabels[slide.destination.screen] ?? slide.destination.screen}`;
  }
  if (slide.destination.kind === 'pack') return `بستهٔ ${slide.destination.packId}`;
  return slide.destination.url;
}

function toDraft(slide: Slide): Draft {
  const destination = slide.destination;
  return {
    slideId: slide.id,
    title: slide.title,
    description: slide.description ?? '',
    kind: destination?.kind ?? 'screen',
    screen: destination?.kind === 'screen' ? destination.screen : 'today',
    packId: destination?.kind === 'pack' ? destination.packId : '',
    url: destination?.kind === 'url' ? destination.url : '',
    isActive: slide.isActive,
  };
}

function draftDestination(draft: Draft): SlideDestination | undefined {
  if (draft.kind === 'screen') return { kind: 'screen', screen: draft.screen };
  if (draft.kind === 'pack') {
    return draft.packId.trim() ? { kind: 'pack', packId: draft.packId.trim() } : undefined;
  }
  return draft.url.trim() ? { kind: 'url', url: draft.url.trim() } : undefined;
}

export function SliderManagerPanel() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [maximumActive, setMaximumActive] = useState(3);
  const [available, setAvailable] = useState(true);
  const [state, setState] = useState<PanelState>('loading');
  const [failure, setFailure] = useState<string>();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [fileError, setFileError] = useState<string>();
  const [pending, setPending] = useState<PendingAction>();
  const [imageVersion, setImageVersion] = useState(0);
  const reauthButton = useRef<HTMLButtonElement>(null);

  const activeCount = slides.filter((slide) => slide.isActive).length;

  const loadSlides = useCallback(async (reportFailure = true) => {
    try {
      const response = await fetch('/api/presentation/slides', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 404) {
        setAvailable(false);
        setState('idle');
        return;
      }
      if (!response.ok) throw new Error('slides unavailable');
      const payload = (await response.json()) as {
        slides?: Slide[];
        maximumActiveSlides?: number;
      };
      setSlides(payload.slides ?? []);
      setMaximumActive(payload.maximumActiveSlides ?? 3);
      setAvailable(true);
      setState((current) => (current === 'loading' ? 'idle' : current));
    } catch {
      if (reportFailure) {
        setFailure('خواندن فهرست اسلایدها ممکن نشد.');
        setState('error');
      }
    }
  }, []);

  useEffect(() => {
    void loadSlides();
  }, [loadSlides]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  useEffect(() => {
    if (state === 'reauth-required') reauthButton.current?.focus();
  }, [state]);

  function chooseFile(nextFile?: File) {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(undefined);
    setFile(undefined);
    setFileError(undefined);
    if (!nextFile) return;
    const rejection = localFileError(nextFile);
    if (rejection) {
      setFileError(rejection);
      return;
    }
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
  }

  function resetForm() {
    chooseFile(undefined);
    setDraft(emptyDraft);
  }

  async function reportFailureFrom(response: Response) {
    const payload = (await response.json().catch(() => undefined)) as
      { code?: string; reason?: string; activeCount?: number } | undefined;
    if (payload?.code === 'active_limit_reached') {
      setFailure(
        `بیشتر از ${maximumActive} اسلاید نمی‌تواند فعال باشد. ابتدا یکی از اسلایدهای فعال را غیرفعال کنید.`,
      );
    } else if (payload?.code === 'image_required') {
      setFailure('برای فعال‌کردن اسلاید، تصویر لازم است.');
    } else if (payload?.code === 'unknown_pack') {
      setFailure('بستهٔ انتخاب‌شده وجود ندارد.');
    } else if (payload?.code === 'invalid_order') {
      setFailure('ترتیب ارسالی معتبر نیست؛ فهرست دوباره خوانده شد.');
    } else if (payload?.code === 'image_rejected') {
      setFailure(rejectionMessages[payload.reason ?? ''] ?? 'تصویر پذیرفته نشد.');
    } else {
      setFailure('ذخیرهٔ تغییر ممکن نشد.');
    }
    setState('error');
  }

  async function sendUpsert(action: { key: string; draft: Draft; file?: File }) {
    const csrfToken = readBrowserCookie('__Host-learnbox_admin_csrf');
    const destination = draftDestination(action.draft);
    if (!csrfToken || !destination || !action.draft.title.trim()) {
      setFailure('اطلاعات اسلاید کامل نیست.');
      setState('error');
      return;
    }
    setState('saving');
    setFailure(undefined);
    const form = new FormData();
    form.set(
      'payload',
      JSON.stringify({
        slideId: action.draft.slideId,
        title: action.draft.title.trim(),
        description: action.draft.description.trim() || null,
        destination,
        isActive: action.draft.isActive,
      }),
    );
    if (action.file) form.set('image', action.file);

    try {
      const response = await fetch('/api/presentation/slides', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'idempotency-key': action.key,
          'x-learnbox-csrf-token': csrfToken,
        },
        body: form,
      });
      if (response.status === 428) {
        setPending({ kind: 'upsert', key: action.key, draft: action.draft, file: action.file });
        setState('reauth-required');
        return;
      }
      if (!response.ok) {
        await reportFailureFrom(response);
        return;
      }
      setPending(undefined);
      resetForm();
      setImageVersion((version) => version + 1);
      await loadSlides(false);
      setState('saved');
    } catch {
      setFailure('ذخیرهٔ تغییر ممکن نشد.');
      setState('error');
    }
  }

  async function sendReorder(action: { key: string; order: string[] }) {
    const csrfToken = readBrowserCookie('__Host-learnbox_admin_csrf');
    if (!csrfToken) {
      setState('error');
      return;
    }
    setState('saving');
    setFailure(undefined);
    try {
      const response = await fetch('/api/presentation/slides/reorder', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': action.key,
          'x-learnbox-csrf-token': csrfToken,
        },
        body: JSON.stringify({ order: action.order }),
      });
      if (response.status === 428) {
        setPending({ kind: 'reorder', key: action.key, order: action.order });
        setState('reauth-required');
        return;
      }
      if (!response.ok) {
        await reportFailureFrom(response);
        await loadSlides(false);
        return;
      }
      setPending(undefined);
      await loadSlides(false);
      setState('saved');
    } catch {
      setFailure('تغییر ترتیب ممکن نشد.');
      setState('error');
    }
  }

  async function reauthenticate() {
    const csrfToken = readBrowserCookie('__Host-learnbox_admin_csrf');
    if (!csrfToken || !pending) {
      setState('error');
      return;
    }
    setState('reauthenticating');
    try {
      const optionsResponse = await fetch('/api/auth/reauth/options', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!optionsResponse.ok) throw new Error('reauth options unavailable');
      const optionsJSON = await optionsResponse.json();
      const assertion = await startAuthentication({ optionsJSON });
      const verifyResponse = await fetch('/api/auth/reauth/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-learnbox-csrf-token': csrfToken,
        },
        body: JSON.stringify({ response: assertion }),
      });
      if (verifyResponse.status !== 204) throw new Error('reauth failed');
      if (pending.kind === 'reorder') await sendReorder(pending);
      else await sendUpsert(pending);
    } catch {
      setFailure('تأیید هویت دوباره ناموفق بود.');
      setState('error');
    }
  }

  function move(slideId: string, offset: -1 | 1) {
    const order = slides.map((slide) => slide.id);
    const from = order.indexOf(slideId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    void sendReorder({ key: crypto.randomUUID(), order });
  }

  function toggleActive(slide: Slide) {
    void sendUpsert({
      key: crypto.randomUUID(),
      draft: { ...toDraft(slide), isActive: !slide.isActive },
    });
  }

  const busy = state === 'saving' || state === 'reauthenticating';

  return (
    <section className="splash-panel" id="slider-management" aria-labelledby="slider-title">
      <div className="splash-panel-heading">
        <div>
          <span className="splash-kicker">اسلایدر صفحهٔ امروز</span>
          <h2 id="slider-title">مدیریت اسلایدها</h2>
          <p>
            حداکثر {maximumActive} اسلاید می‌تواند همزمان فعال باشد. این محدودیت روی سرور اعمال
            می‌شود.
          </p>
        </div>
        <span className="splash-private-badge">فقط مدیر</span>
      </div>

      {!available ? (
        <p className="splash-status" role="status">
          مدیریت نمایش در این محیط فعال نیست.
        </p>
      ) : (
        <div className="splash-panel-grid">
          <div className="splash-current-card">
            <h3>
              اسلایدهای موجود{' '}
              <span className="slide-active-count" dir="ltr">
                {activeCount}/{maximumActive}
              </span>
            </h3>
            {state === 'loading' ? (
              <p className="splash-status" role="status">
                در حال خواندن فهرست…
              </p>
            ) : slides.length === 0 ? (
              <p className="splash-status" role="status">
                هنوز اسلایدی ساخته نشده است.
              </p>
            ) : (
              <ul className="slide-list">
                {slides.map((slide, index) => (
                  <li key={slide.id} className="slide-row">
                    <div className="splash-frame slide-thumb">
                      {slide.hasImage ? (
                        <img
                          src={`/api/presentation/slides/image?slideId=${encodeURIComponent(slide.id)}&v=${imageVersion}`}
                          alt={`پیش‌نمایش اسلاید ${slide.title}`}
                        />
                      ) : (
                        <span>بدون تصویر</span>
                      )}
                    </div>
                    <div className="slide-body">
                      <p className="slide-title">
                        {slide.title}
                        <span
                          className={slide.isActive ? 'slide-badge-on' : 'slide-badge-off'}
                          data-active={slide.isActive}
                        >
                          {slide.isActive ? 'فعال' : 'غیرفعال'}
                        </span>
                      </p>
                      {slide.description ? <p className="muted">{slide.description}</p> : null}
                      <p className="slide-destination" dir="auto">
                        {describeDestination(slide)}
                      </p>
                      <div className="slide-actions">
                        <button
                          type="button"
                          className="splash-secondary-action"
                          disabled={busy}
                          onClick={() => {
                            setDraft(toDraft(slide));
                            chooseFile(undefined);
                            setState('idle');
                          }}
                        >
                          ویرایش
                        </button>
                        <button
                          type="button"
                          className="splash-secondary-action"
                          disabled={busy}
                          onClick={() => toggleActive(slide)}
                        >
                          {slide.isActive ? 'غیرفعال‌کردن' : 'فعال‌کردن'}
                        </button>
                        <button
                          type="button"
                          className="splash-secondary-action"
                          disabled={busy || index === 0}
                          aria-label={`انتقال اسلاید ${slide.title} به بالا`}
                          onClick={() => move(slide.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="splash-secondary-action"
                          disabled={busy || index === slides.length - 1}
                          aria-label={`انتقال اسلاید ${slide.title} به پایین`}
                          onClick={() => move(slide.id, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="splash-upload-card">
            <h3>{draft.slideId ? 'ویرایش اسلاید' : 'اسلاید جدید'}</h3>

            <label className="slide-field" htmlFor="slide-title-input">
              <span>عنوان</span>
              <input
                id="slide-title-input"
                type="text"
                maxLength={120}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>

            <label className="slide-field" htmlFor="slide-description-input">
              <span>توضیح (اختیاری)</span>
              <textarea
                id="slide-description-input"
                rows={2}
                maxLength={280}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </label>

            <label className="slide-field" htmlFor="slide-destination-kind">
              <span>مقصد</span>
              <select
                id="slide-destination-kind"
                value={draft.kind}
                onChange={(event) =>
                  setDraft({ ...draft, kind: event.target.value as Draft['kind'] })
                }
              >
                <option value="screen">صفحهٔ برنامه</option>
                <option value="pack">بستهٔ مشخص</option>
                <option value="url">نشانی بیرونی</option>
              </select>
            </label>

            {draft.kind === 'screen' ? (
              <label className="slide-field" htmlFor="slide-screen">
                <span>کدام صفحه</span>
                <select
                  id="slide-screen"
                  value={draft.screen}
                  onChange={(event) => setDraft({ ...draft, screen: event.target.value })}
                >
                  {Object.entries(screenLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ) : draft.kind === 'pack' ? (
              <label className="slide-field" htmlFor="slide-pack">
                <span>شناسهٔ بسته</span>
                <input
                  id="slide-pack"
                  type="text"
                  dir="ltr"
                  value={draft.packId}
                  onChange={(event) => setDraft({ ...draft, packId: event.target.value })}
                />
              </label>
            ) : (
              <label className="slide-field" htmlFor="slide-url">
                <span>نشانی (فقط https)</span>
                <input
                  id="slide-url"
                  type="url"
                  dir="ltr"
                  placeholder="https://example.com/page"
                  value={draft.url}
                  onChange={(event) => setDraft({ ...draft, url: event.target.value })}
                />
              </label>
            )}

            <label className="splash-file-control">
              <span>{draft.slideId ? 'تصویر جدید (اختیاری)' : 'تصویر اسلاید'}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => chooseFile(event.target.files?.[0] ?? undefined)}
              />
            </label>

            {fileError ? (
              <p className="splash-error" role="alert">
                {fileError}
              </p>
            ) : null}

            {preview ? (
              <div className="splash-local-preview slide-thumb">
                <img src={preview} alt="پیش‌نمایش تصویر انتخاب‌شده" />
              </div>
            ) : null}

            <label className="slide-checkbox" htmlFor="slide-active">
              <input
                id="slide-active"
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
              />
              <span>این اسلاید فعال باشد</span>
            </label>

            <div className="slide-actions">
              <button
                type="button"
                className="splash-primary-action"
                disabled={busy || !draft.title.trim() || !draftDestination(draft)}
                onClick={() => void sendUpsert({ key: crypto.randomUUID(), draft, file })}
              >
                {draft.slideId ? 'ذخیرهٔ اسلاید' : 'ساخت اسلاید'}
              </button>
              {draft.slideId ? (
                <button
                  type="button"
                  className="splash-secondary-action"
                  disabled={busy}
                  onClick={resetForm}
                >
                  انصراف
                </button>
              ) : null}
            </div>

            {state === 'saving' ? (
              <p className="splash-status" role="status" aria-live="polite">
                در حال ذخیره…
              </p>
            ) : null}
            {state === 'reauthenticating' ? (
              <p className="splash-status" role="status" aria-live="polite">
                در حال تأیید هویت…
              </p>
            ) : null}
            {state === 'reauth-required' ? (
              <div className="splash-reauth" role="status">
                <p>برای این تغییر، تأیید هویت دوباره لازم است.</p>
                <button
                  type="button"
                  ref={reauthButton}
                  className="splash-primary-action"
                  onClick={() => void reauthenticate()}
                >
                  تأیید هویت
                </button>
              </div>
            ) : null}
            {state === 'saved' ? (
              <p className="splash-success" role="status" tabIndex={-1}>
                تغییر ذخیره شد.
              </p>
            ) : null}
            {state === 'error' && failure ? (
              <p className="splash-error" role="alert">
                {failure}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
