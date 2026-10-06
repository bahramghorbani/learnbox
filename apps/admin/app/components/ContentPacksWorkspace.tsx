'use client';

import React, { useCallback, useEffect, useState } from 'react';

import {
  ContentImportModal,
  type ImportAnalysis,
  type ImportResultSummary,
} from './ContentImportModal';
import {
  AiPackGenerationModal,
  type AcceptSummary,
  type GenerationJobView,
} from './AiPackGenerationModal';
import {
  CardMediaPanel,
  type CardMediaKind,
  type MediaCandidateView,
  type MediaKindState,
} from './CardMediaPanel';
import { PackLifecyclePanel } from './PackLifecyclePanel';
import {
  CardFormModal,
  PackFormModal,
  emptyCardForm,
  emptyPackForm,
  type CardFormValues,
  type FieldIssue,
  type PackFormValues,
  type SubmitOutcome,
} from './ContentPackForms';

import { AdminSidebar } from './AdminSidebar';

/**
 * Phase 1 / Milestone 1.1 — Content & Packs workspace.
 *
 * Visual source of truth: the APPROVED, DESIGN FROZEN Admin prototype
 * (`prototypes/admin-ui-v1/content.html`, PDR-009). Every number rendered here comes from the
 * canonical LearnBox database through `/api/content/packs`; there is no static business data and
 * no fabricated count. Where the canonical schema genuinely cannot answer a field the prototype
 * shows, the UI says so explicitly instead of inventing a value.
 */

type ServerPack = {
  id: string;
  displayName: string;
  description: string | null;
  locale: string;
  targetCefr: string;
  targetItemCount: number;
  category: string | null;
  isFree: boolean;
  priceTomans: number | null;
  status: string;
  cardCount: number;
  publishedCardCount: number;
  reviewableCardCount: number;
  createdAt: string | null;
  publishedAt: string | null;
};

type ServerCardMedia = {
  imageCount: number;
  wordAudioCount: number;
  sentenceAudioCount: number;
  unrecorded: boolean;
};

type ServerCard = {
  cardId: string;
  contentId: string;
  cardVersionId: string;
  lemma: string;
  article: string | null;
  partOfSpeech: string;
  persianMeanings: string[];
  essentialInflection: string | null;
  pronunciationIpa: string | null;
  examples: Array<{ german: string; persian: string }>;
  simpleGermanDefinition: string;
  grammarNote: string;
  topicTags: string[];
  difficulty: number;
  cefr: string;
  visualConcept: string;
  imagePrompt: string;
  sourceReference: string;
  versionStatus: string;
  sortOrder: number;
  media: ServerCardMedia;
};

type Phase = 'loading' | 'unauthorized' | 'disabled' | 'error' | 'empty' | 'ready';

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** Persian digit presentation, matching the frozen prototype's `fa()` helper. */
function fa(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => FA_DIGITS[Number(digit)]);
}

function faNum(value: number): string {
  return fa(value.toLocaleString('en-US'));
}

/** Canonical pack status → approved badge treatment, mirroring the prototype's `packBadge()`. */
const PACK_BADGE: Record<string, readonly [string, string]> = {
  draft: ['b-grey', 'پیش‌نویس'],
  ai_generated: ['b-grey', 'ساخته‌شده با هوش مصنوعی'],
  needs_review: ['b-amber', 'در انتظار بررسی'],
  approved: ['b-amber', 'تأییدشده'],
  published: ['b-green', 'منتشر شده'],
  archived: ['b-grey', 'بایگانی‌شده'],
};

const CARD_BADGE: Record<string, readonly [string, string]> = {
  draft: ['b-grey', 'پیش‌نویس'],
  auto_validated: ['b-amber', 'در انتظار بررسی'],
  needs_review: ['b-amber', 'در انتظار بررسی'],
  approved: ['b-green', 'تأییدشده'],
  published: ['b-green', 'منتشر شده'],
  rejected: ['b-rose', 'ردشده'],
  deprecated: ['b-grey', 'بایگانی‌شده'],
};

function PackBadge({ status }: { status: string }) {
  const [tone, label] = PACK_BADGE[status] ?? ['b-grey', status];
  return <span className={`badge ${tone}`}>{label}</span>;
}

function CardBadge({ status }: { status: string | null }) {
  if (!status) return <span className="badge b-grey">بدون نسخه</span>;
  const [tone, label] = CARD_BADGE[status] ?? ['b-grey', status];
  return <span className={`badge ${tone}`}>{label}</span>;
}

/** Media availability cell. When the canonical `media[]` array is empty the UI shows «—» meaning
 *  "not recorded yet" — it never renders an absent value as a confirmed "no". */
function MediaMark({ count, unrecorded }: { count: number; unrecorded: boolean }) {
  if (unrecorded) {
    return (
      <span className="cp-media-unknown" title="در دادهٔ کانونی ثبت نشده است">
        —
      </span>
    );
  }
  return count > 0 ? (
    <span className="cp-media-yes" aria-label="دارد">
      ✓
    </span>
  ) : (
    <span className="cp-media-no" aria-label="ندارد">
      ✗
    </span>
  );
}

const STATE_TABS = [
  { key: 'all', label: 'همه' },
  { key: 'published', label: 'منتشر شده' },
  { key: 'needs_review', label: 'در انتظار بررسی' },
  { key: 'draft', label: 'پیش‌نویس' },
] as const;

function readBrowserCookie(name: string): string | undefined {
  return document.cookie
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function createClientKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (part) => {
    const random = Math.floor(Math.random() * 16);
    const value = part === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function splitList(value: string): string[] {
  return value
    .split(/[،,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * JSON POST for the AI generation routes (Phase 1 / M1.4).
 *
 * Same credential and CSRF contract as `sendMutation`; it exists separately only because these
 * routes return a payload the caller needs (job state, analysis), which `sendMutation` discards.
 */
async function postAiJson<T>(
  path: string,
  body: unknown,
): Promise<{ ok: true; payload: T } | { ok: false; message: string }> {
  const csrfToken = readBrowserCookie('__Host-learnbox_admin_csrf');
  if (!csrfToken) {
    return { ok: false, message: 'نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.' };
  }
  try {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-learnbox-csrf-token': csrfToken },
      body: JSON.stringify(body),
    });
    if (response.ok) return { ok: true, payload: (await response.json()) as T };
    if (response.status === 401) {
      return { ok: false, message: 'نشست معتبر نیست؛ دوباره وارد شوید.' };
    }
    if (response.status === 403) {
      return { ok: false, message: 'نقش شما اجازهٔ ساخت محتوا را ندارد.' };
    }
    if (response.status === 428) {
      return { ok: false, message: 'احراز هویت مجدد لازم است؛ دوباره وارد شوید.' };
    }
    const payload = (await response.json().catch(() => undefined)) as
      { message?: string; code?: string } | undefined;
    // The server's own reason is preferred, so an unconfigured provider says exactly that.
    if (payload?.message) return { ok: false, message: payload.message };
    return { ok: false, message: 'درخواست تولید با خطا روبه‌رو شد.' };
  } catch {
    return { ok: false, message: 'ارتباط با سرور برقرار نشد.' };
  }
}

/**
 * Single mutation path for all four writes: session cookie + CSRF header + per-attempt
 * idempotency key, exactly like the content-review workspace. Server status codes map to the
 * outcomes the forms render, so no mutation can report success it did not get.
 */
async function sendMutation(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<SubmitOutcome> {
  const csrfToken = readBrowserCookie('__Host-learnbox_admin_csrf');
  if (!csrfToken) {
    return { ok: false, message: 'نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.' };
  }
  try {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-learnbox-csrf-token': csrfToken,
        'idempotency-key': createClientKey(),
      },
      body: JSON.stringify(body),
    });
    if (response.ok) return { ok: true };
    if (response.status === 401) {
      return { ok: false, message: 'نشست معتبر نیست؛ دوباره وارد شوید.' };
    }
    if (response.status === 403) {
      return { ok: false, message: 'نقش شما اجازهٔ ویرایش محتوا را ندارد.' };
    }
    if (response.status === 428) {
      return { ok: false, message: 'احراز هویت مجدد لازم است؛ دوباره وارد شوید.' };
    }
    if (response.status === 422) {
      const payload = (await response.json().catch(() => undefined)) as
        { issues?: FieldIssue[] } | undefined;
      return {
        ok: false,
        issues: payload?.issues ?? [],
        message: 'محتوا با قواعد کانونی سازگار نیست؛ موارد مشخص‌شده را اصلاح کنید.',
      };
    }
    if (response.status === 409) {
      const payload = (await response.json().catch(() => undefined)) as
        { reason?: string } | undefined;
      return {
        ok: false,
        message:
          payload?.reason === 'content_id_exists'
            ? 'کارتی با همین شناسهٔ کانونی از قبل وجود دارد.'
            : payload?.reason === 'pack_exists'
              ? 'بسته‌ای با همین شناسه از قبل وجود دارد.'
              : 'این تغییر با وضعیت فعلی دادهٔ کانونی سازگار نیست.',
      };
    }
    return { ok: false, message: 'ذخیرهٔ تغییرات ناموفق بود.' };
  } catch {
    return { ok: false, message: 'ارتباط با سرور برقرار نشد؛ تغییری ذخیره نشد.' };
  }
}

/**
 * Single upload path for both import steps (M1.3). Same session cookie + CSRF header as
 * `sendMutation`; the body is multipart because it carries a file. Preview and confirm differ
 * only by endpoint and by the fields that bind a confirm to the previewed analysis.
 */
async function sendImport(
  path: string,
  file: File,
  packId: string,
  extra: Record<string, string> = {},
): Promise<{ ok: true; payload: unknown } | { ok: false; message: string }> {
  const csrfToken = readBrowserCookie('__Host-learnbox_admin_csrf');
  if (!csrfToken) {
    return { ok: false, message: 'نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.' };
  }
  const form = new FormData();
  form.set('packId', packId);
  form.set('file', file, file.name);
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  try {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'x-learnbox-csrf-token': csrfToken },
      body: form,
    });
    if (response.ok) return { ok: true, payload: await response.json() };
    if (response.status === 401) {
      return { ok: false, message: 'نشست معتبر نیست؛ دوباره وارد شوید.' };
    }
    if (response.status === 403) {
      return { ok: false, message: 'نقش شما اجازهٔ ویرایش محتوا را ندارد.' };
    }
    if (response.status === 428) {
      return { ok: false, message: 'احراز هویت مجدد لازم است؛ دوباره وارد شوید.' };
    }
    if (response.status === 413) {
      return { ok: false, message: 'حجم فایل بیش از حد مجاز است.' };
    }
    if (response.status === 422 || response.status === 409) {
      const payload = (await response.json().catch(() => undefined)) as
        { message?: string } | undefined;
      return { ok: false, message: payload?.message ?? 'فایل قابل پردازش نیست.' };
    }
    return { ok: false, message: 'پردازش فایل ناموفق بود.' };
  } catch {
    return { ok: false, message: 'ارتباط با سرور برقرار نشد؛ چیزی ذخیره نشد.' };
  }
}

function packFormFrom(pack: ServerPack): PackFormValues {
  return {
    packId: pack.id,
    displayName: pack.displayName,
    description: pack.description ?? '',
    targetCefr: pack.targetCefr || 'A1',
    category: pack.category ?? '',
    targetItemCount: pack.targetItemCount ? String(pack.targetItemCount) : '',
    isFree: pack.isFree,
  };
}

function cardFormFrom(card: ServerCard): CardFormValues {
  return {
    lemma: card.lemma,
    article: card.article ?? '',
    partOfSpeech: card.partOfSpeech,
    essentialInflection: card.essentialInflection ?? '',
    pronunciationIpa: card.pronunciationIpa ?? '',
    persianMeanings: card.persianMeanings.join('، '),
    exampleGerman: card.examples[0]?.german ?? '',
    examplePersian: card.examples[0]?.persian ?? '',
    simpleGermanDefinition: card.simpleGermanDefinition,
    grammarNote: card.grammarNote,
    topicTags: card.topicTags.join('، '),
    difficulty: String(card.difficulty || 1),
    cefr: card.cefr || 'A1',
    visualConcept: card.visualConcept,
    imagePrompt: card.imagePrompt,
    sourceReference: card.sourceReference,
  };
}

/** Form values → the canonical request body the write routes expect. */
function cardRequestBody(values: CardFormValues) {
  return {
    lemma: values.lemma.trim(),
    article: values.article || undefined,
    partOfSpeech: values.partOfSpeech,
    essentialInflection: values.essentialInflection.trim() || undefined,
    pronunciationIpa: values.pronunciationIpa.trim() || undefined,
    persianMeanings: splitList(values.persianMeanings),
    examples: [{ german: values.exampleGerman.trim(), persian: values.examplePersian.trim() }],
    simpleGermanDefinition: values.simpleGermanDefinition.trim(),
    grammarNote: values.grammarNote.trim(),
    topicTags: splitList(values.topicTags),
    difficulty: Number(values.difficulty),
    cefr: values.cefr,
    visualConcept: values.visualConcept.trim(),
    imagePrompt: values.imagePrompt.trim(),
    sourceReference: values.sourceReference.trim(),
  };
}

export function ContentPacksWorkspace() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [packs, setPacks] = useState<ServerPack[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [openPackId, setOpenPackId] = useState<string>();
  const [cards, setCards] = useState<ServerCard[]>([]);
  const [cardsPhase, setCardsPhase] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  // Management surface (Phase 1 / M1.2). `manageEnabled` comes from the server, so create/edit
  // controls never render when the write routes would 404.
  const [manageEnabled, setManageEnabled] = useState(false);
  const [packForm, setPackForm] = useState<{ mode: 'create' | 'edit'; values: PackFormValues }>();
  const [cardForm, setCardForm] = useState<{
    mode: 'create' | 'edit';
    cardId?: string;
    values: CardFormValues;
  }>();
  const [savedNotice, setSavedNotice] = useState<string>();
  // Bulk import (Phase 1 / M1.3) rides the same manage gate as create/edit. The import key is
  // minted ONCE per opened import, so re-clicking confirm (or retrying after a network error)
  // replays the same keys and cannot create a second copy of the same rows.
  const [importSession, setImportSession] = useState<{ packId: string; importKey: string }>();
  // AI generation (M1.4) has its own default-off gate on top of `manageEnabled`.
  const [aiEnabled, setAiEnabled] = useState(false);
  const [mediaEnabled, setMediaEnabled] = useState(false);
  /** The card whose media panel is open, if any. */
  const [mediaCard, setMediaCard] = useState<{ cardId: string; label: string } | undefined>(
    undefined,
  );
  const [aiSession, setAiSession] = useState<{ acceptKey: string }>();

  const loadPacks = useCallback(async () => {
    setPhase('loading');
    try {
      const response = await fetch('/api/content/packs', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 404) {
        setPhase('disabled');
        return;
      }
      if (response.status === 401) {
        setPhase('unauthorized');
        return;
      }
      if (!response.ok) throw new Error('packs unavailable');
      const payload = (await response.json()) as {
        packs?: ServerPack[];
        manageEnabled?: boolean;
        aiEnabled?: boolean;
        mediaEnabled?: boolean;
      };
      const list = Array.isArray(payload.packs) ? payload.packs : [];
      setPacks(list);
      setManageEnabled(payload.manageEnabled === true);
      setAiEnabled(payload.aiEnabled === true);
      setMediaEnabled(payload.mediaEnabled === true);
      setPhase(list.length === 0 ? 'empty' : 'ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void loadPacks();
  }, [loadPacks]);

  const loadCards = useCallback(async (packId: string) => {
    setCardsPhase('loading');
    setCards([]);
    try {
      const response = await fetch(`/api/content/packs/${encodeURIComponent(packId)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('cards unavailable');
      const payload = (await response.json()) as { cards?: ServerCard[] };
      setCards(Array.isArray(payload.cards) ? payload.cards : []);
      setCardsPhase('ready');
    } catch {
      setCardsPhase('error');
    }
  }, []);

  function openPack(packId: string) {
    setOpenPackId(packId);
    void loadCards(packId);
  }

  /** After any successful write, re-read from the server — the list must reflect persisted rows,
   *  never optimistic local state. */
  async function refreshAfterWrite(notice: string, packId?: string) {
    setSavedNotice(notice);
    await loadPacks();
    const target = packId ?? openPackId;
    if (target) await loadCards(target);
  }

  async function submitPackForm(values: PackFormValues): Promise<SubmitOutcome> {
    const creating = packForm?.mode === 'create';
    const body = {
      displayName: values.displayName.trim(),
      description: values.description.trim() || undefined,
      targetCefr: values.targetCefr,
      category: values.category.trim() || undefined,
      targetItemCount: values.targetItemCount ? Number(values.targetItemCount) : undefined,
      isFree: values.isFree,
    };
    const outcome = creating
      ? await sendMutation('/api/content/packs', 'POST', {
          ...body,
          packId: values.packId.trim(),
        })
      : await sendMutation(
          `/api/content/packs/${encodeURIComponent(values.packId)}`,
          'PATCH',
          body,
        );
    if (outcome.ok) {
      await refreshAfterWrite(creating ? 'بستهٔ تازه ساخته شد.' : 'بسته به‌روزرسانی شد.');
    }
    return outcome;
  }

  async function submitCardForm(values: CardFormValues): Promise<SubmitOutcome> {
    if (!cardForm) return { ok: false, message: 'فرمی باز نیست.' };
    const body = cardRequestBody(values);
    const outcome =
      cardForm.mode === 'create'
        ? await sendMutation(
            `/api/content/packs/${encodeURIComponent(openPackId ?? '')}/cards`,
            'POST',
            body,
          )
        : await sendMutation(
            `/api/content/cards/${encodeURIComponent(cardForm.cardId ?? '')}`,
            'PATCH',
            body,
          );
    if (outcome.ok) {
      await refreshAfterWrite(
        cardForm.mode === 'create' ? 'کارت تازه ساخته شد.' : 'کارت به‌روزرسانی شد.',
      );
    }
    return outcome;
  }

  const visible = packs.filter((pack) => (filter === 'all' ? true : pack.status === filter));
  const tabCount = (key: string) =>
    key === 'all' ? packs.length : packs.filter((pack) => pack.status === key).length;

  // Every KPI below is a real aggregate over canonical rows — never a literal.
  const totalCards = packs.reduce((sum, pack) => sum + pack.cardCount, 0);
  const publishedCards = packs.reduce((sum, pack) => sum + pack.publishedCardCount, 0);
  const reviewableCards = packs.reduce((sum, pack) => sum + pack.reviewableCardCount, 0);
  const publishedPacks = packs.filter((pack) => pack.status === 'published').length;
  const freePacks = packs.filter((pack) => pack.isFree).length;

  const openPackRecord = packs.find((pack) => pack.id === openPackId);
  // Media facts exist per card version, so this is only known once a pack's cards are loaded.
  const loadedMediaRecorded = cards.some((card) => !card.media.unrecorded);

  return (
    <main className="admin-shell cp-workspace" id="content">
      <AdminSidebar current="content" />
      <section className="admin-workspace">
        <div className="page-head">
          <div>
            <h1>محتوا و بسته‌ها</h1>
            <p className="muted">
              بسته‌ها و کارت‌های واقعی LearnBox، خوانده‌شده از پایگاه دادهٔ کانونی.
            </p>
          </div>
          {manageEnabled && phase !== 'disabled' && phase !== 'unauthorized' ? (
            <div className="cp-head-actions">
              {aiEnabled ? (
                <button
                  className="btn"
                  type="button"
                  onClick={() => setAiSession({ acceptKey: createClientKey() })}
                >
                  ساخت بسته با هوش مصنوعی
                </button>
              ) : null}
              <button
                className="btn primary"
                type="button"
                onClick={() => setPackForm({ mode: 'create', values: emptyPackForm })}
              >
                افزودن بستهٔ جدید
              </button>
            </div>
          ) : null}
        </div>

        {savedNotice ? (
          <div className="notice" role="status" aria-live="polite" data-cp-state="saved">
            <span>{savedNotice}</span>
            <button className="btn" type="button" onClick={() => setSavedNotice(undefined)}>
              بستن
            </button>
          </div>
        ) : null}

        {phase === 'disabled' ? (
          <div className="notice" role="status" data-cp-state="disabled">
            <span>
              نمای «محتوا و بسته‌ها» در این محیط غیرفعال است؛ هیچ دادهٔ محتوایی خوانده نمی‌شود.
            </span>
          </div>
        ) : null}

        {phase === 'loading' ? (
          <div className="notice" role="status" aria-live="polite" data-cp-state="loading">
            <span>در حال دریافت بسته‌ها از سرور…</span>
          </div>
        ) : null}

        {phase === 'unauthorized' ? (
          <div className="notice" role="status" data-cp-state="unauthorized">
            <span>نشست امن معتبر نیست؛ برای مشاهدهٔ محتوا دوباره وارد شوید.</span>
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className="notice rose" role="status" data-cp-state="error">
            <span>دریافت بسته‌ها از سرور ناموفق بود.</span>
            <button className="btn" type="button" onClick={() => void loadPacks()}>
              تلاش دوباره
            </button>
          </div>
        ) : null}

        {phase === 'empty' ? (
          <div className="notice" role="status" data-cp-state="empty">
            <span>هنوز هیچ بستهٔ محتوایی در پایگاه دادهٔ کانونی ثبت نشده است.</span>
          </div>
        ) : null}

        {phase === 'ready' ? (
          <>
            <div className="kpi-row" aria-label="شمارنده‌های محتوا">
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">بسته‌ها</span>
                </div>
                <div className="kpi-value" data-cp-kpi="packs">
                  {faNum(packs.length)}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">بستهٔ منتشرشده</span>
                </div>
                <div className="kpi-value" data-cp-kpi="published-packs">
                  {faNum(publishedPacks)}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">کارت‌ها</span>
                </div>
                <div className="kpi-value" data-cp-kpi="cards">
                  {faNum(totalCards)}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">کارت منتشرشده</span>
                </div>
                <div className="kpi-value" data-cp-kpi="published-cards">
                  {faNum(publishedCards)}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">در انتظار بررسی</span>
                </div>
                <div className="kpi-value" data-cp-kpi="reviewable-cards">
                  {faNum(reviewableCards)}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">بستهٔ رایگان</span>
                </div>
                <div className="kpi-value" data-cp-kpi="free-packs">
                  {faNum(freePacks)}
                </div>
              </div>
            </div>

            <div className="card mb">
              <div className="tabs" role="tablist" aria-label="وضعیت بسته">
                {STATE_TABS.map((tab) => (
                  <button
                    aria-selected={filter === tab.key}
                    className={filter === tab.key ? 'tab on' : 'tab'}
                    key={tab.key}
                    onClick={() => setFilter(tab.key)}
                    role="tab"
                    type="button"
                  >
                    {tab.label} ({faNum(tabCount(tab.key))})
                  </button>
                ))}
              </div>
              <div className="toolbar">
                <div style={{ flex: 1 }} />
                <button
                  className={view === 'grid' ? 'chip on' : 'chip'}
                  onClick={() => setView('grid')}
                  type="button"
                >
                  کارت
                </button>
                <button
                  className={view === 'list' ? 'chip on' : 'chip'}
                  onClick={() => setView('list')}
                  type="button"
                >
                  جدول
                </button>
              </div>
            </div>

            {view === 'grid' ? (
              <div className="pack-grid" data-cp-view="grid">
                {visible.map((pack) => (
                  <article className="pack-card" key={pack.id}>
                    <div className="pack-body">
                      <div className="pack-name">{pack.displayName}</div>
                      <div className="pack-meta">
                        <span>{faNum(pack.cardCount)} کارت</span>
                        <span className="ltr">{pack.targetCefr}</span>
                        {pack.category ? <span>{pack.category}</span> : null}
                      </div>
                      {pack.description ? <p className="muted">{pack.description}</p> : null}
                      <div className="pack-foot">
                        <PackBadge status={pack.status} />
                        <button className="btn" onClick={() => openPack(pack.id)} type="button">
                          مشاهدهٔ کارت‌ها
                        </button>
                        {manageEnabled ? (
                          <button
                            className="btn"
                            type="button"
                            onClick={() =>
                              setPackForm({ mode: 'edit', values: packFormFrom(pack) })
                            }
                          >
                            ویرایش
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="card" data-cp-view="list">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>نام بسته</th>
                      <th>سطح</th>
                      <th>کارت</th>
                      <th>منتشرشده</th>
                      <th>وضعیت</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((pack) => (
                      <tr key={pack.id}>
                        <td>{pack.displayName}</td>
                        <td className="ltr">{pack.targetCefr}</td>
                        <td>{faNum(pack.cardCount)}</td>
                        <td>{faNum(pack.publishedCardCount)}</td>
                        <td>
                          <PackBadge status={pack.status} />
                        </td>
                        <td>
                          <button className="btn" onClick={() => openPack(pack.id)} type="button">
                            کارت‌ها
                          </button>
                          {manageEnabled ? (
                            <button
                              className="btn"
                              type="button"
                              onClick={() =>
                                setPackForm({ mode: 'edit', values: packFormFrom(pack) })
                              }
                            >
                              ویرایش
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="tbl-foot">
                  <span>{faNum(visible.length)} بسته</span>
                </div>
              </div>
            )}

            {openPackId ? (
              <div className="card" data-cp-cards-panel={openPackId}>
                <div className="card-head">
                  <span className="card-title">
                    کارت‌های بسته: {openPackRecord?.displayName ?? openPackId}
                  </span>
                  <button className="btn" onClick={() => setOpenPackId(undefined)} type="button">
                    بستن
                  </button>
                  {manageEnabled ? (
                    <button
                      className="btn primary"
                      type="button"
                      onClick={() => setCardForm({ mode: 'create', values: emptyCardForm })}
                    >
                      افزودن کارت
                    </button>
                  ) : null}
                  {manageEnabled && openPackId ? (
                    <button
                      className="btn"
                      type="button"
                      onClick={() =>
                        setImportSession({ packId: openPackId, importKey: createClientKey() })
                      }
                    >
                      درون‌ریزی CSV / XLSX
                    </button>
                  ) : null}
                </div>
                <div className="card-body">
                  {manageEnabled ? (
                    <PackLifecyclePanel
                      packId={openPackId}
                      manageEnabled={manageEnabled}
                      onAction={(path, body) => sendMutation(path, 'POST', body)}
                      onChanged={() => {
                        // A lifecycle change rewrites canonical pack and card state.
                        void loadPacks();
                        void loadCards(openPackId);
                      }}
                    />
                  ) : null}
                  {cardsPhase === 'loading' ? (
                    <p className="muted" role="status" aria-live="polite">
                      در حال دریافت کارت‌ها…
                    </p>
                  ) : null}
                  {cardsPhase === 'error' ? (
                    <div className="notice rose" role="status">
                      <span>دریافت کارت‌های این بسته ناموفق بود.</span>
                      <button
                        className="btn"
                        onClick={() => void loadCards(openPackId)}
                        type="button"
                      >
                        تلاش دوباره
                      </button>
                    </div>
                  ) : null}
                  {cardsPhase === 'ready' && cards.length === 0 ? (
                    <p className="muted" role="status">
                      این بسته هیچ کارتی ندارد.
                    </p>
                  ) : null}
                  {cardsPhase === 'ready' && cards.length > 0 ? (
                    <>
                      {!loadedMediaRecorded ? (
                        <div className="notice" role="status" data-cp-state="media-gap">
                          <span>
                            وضعیت تصویر و صدا برای کارت‌های این بسته در دادهٔ کانونی ثبت نشده است
                            («—»). این یک کمبود واقعی داده است و هیچ مقدار جایگزینی ساخته نمی‌شود.
                          </span>
                        </div>
                      ) : null}
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>واژه</th>
                            <th>معنی فارسی</th>
                            <th>تلفظ</th>
                            <th>مثال</th>
                            <th>تصویر</th>
                            <th>صدای واژه</th>
                            <th>صدای جمله</th>
                            <th>وضعیت</th>
                            {manageEnabled ? <th /> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {cards.map((card) => (
                            <tr key={card.cardId}>
                              <td className="ltr">
                                {card.article ? `${card.article} ` : ''}
                                {card.lemma}
                              </td>
                              <td>{card.persianMeanings.join('، ') || '—'}</td>
                              <td className="ltr mono">{card.pronunciationIpa ?? '—'}</td>
                              <td>{faNum(card.examples.length)}</td>
                              <td>
                                <MediaMark
                                  count={card.media.imageCount}
                                  unrecorded={card.media.unrecorded}
                                />
                              </td>
                              <td>
                                <MediaMark
                                  count={card.media.wordAudioCount}
                                  unrecorded={card.media.unrecorded}
                                />
                              </td>
                              <td>
                                <MediaMark
                                  count={card.media.sentenceAudioCount}
                                  unrecorded={card.media.unrecorded}
                                />
                              </td>
                              <td>
                                <CardBadge status={card.versionStatus} />
                              </td>
                              {manageEnabled ? (
                                <td>
                                  <button
                                    className="btn"
                                    type="button"
                                    onClick={() =>
                                      setCardForm({
                                        mode: 'edit',
                                        cardId: card.cardId,
                                        values: cardFormFrom(card),
                                      })
                                    }
                                  >
                                    ویرایش
                                  </button>
                                  {mediaEnabled ? (
                                    <button
                                      className="btn"
                                      type="button"
                                      onClick={() =>
                                        setMediaCard({
                                          cardId: card.cardId,
                                          label: `${card.article ? `${card.article} ` : ''}${card.lemma}`,
                                        })
                                      }
                                    >
                                      رسانه
                                    </button>
                                  ) : null}
                                </td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {mediaCard ? (
        <CardMediaPanel
          cardId={mediaCard.cardId}
          cardLabel={mediaCard.label}
          onClose={() => {
            setMediaCard(undefined);
            // Accepted media changes the canonical read model, so refresh the card table.
            void loadPacks();
          }}
          onLoadState={async () => {
            try {
              const response = await fetch(
                `/api/content/media/state?cardId=${encodeURIComponent(mediaCard.cardId)}`,
                { credentials: 'same-origin', headers: { accept: 'application/json' } },
              );
              if (!response.ok) return undefined;
              const payload = (await response.json()) as { media?: MediaKindState[] };
              return payload.media;
            } catch {
              return undefined;
            }
          }}
          onGenerate={async (kind: CardMediaKind) => {
            const result = await postAiJson<{ candidate: MediaCandidateView }>(
              '/api/content/media/generate',
              { cardId: mediaCard.cardId, kind },
            );
            return result.ok
              ? { ok: true as const, candidate: result.payload.candidate }
              : { ok: false as const, message: result.message };
          }}
          onAccept={async (kind: CardMediaKind, candidateId: string) => {
            const result = await postAiJson<unknown>('/api/content/media/accept', {
              cardId: mediaCard.cardId,
              kind,
              candidateId,
            });
            return result.ok
              ? { ok: true as const }
              : { ok: false as const, message: result.message };
          }}
          assetUrl={(candidateId) =>
            `/api/content/media/asset?candidateId=${encodeURIComponent(candidateId)}`
          }
        />
      ) : null}

      {packForm ? (
        <PackFormModal
          mode={packForm.mode}
          initial={packForm.values}
          onClose={() => setPackForm(undefined)}
          onSubmit={submitPackForm}
        />
      ) : null}

      {cardForm ? (
        <CardFormModal
          mode={cardForm.mode}
          initial={cardForm.values}
          packLabel={openPackRecord?.displayName ?? openPackId ?? ''}
          onClose={() => setCardForm(undefined)}
          onSubmit={submitCardForm}
        />
      ) : null}

      {importSession ? (
        <ContentImportModal
          packLabel={openPackRecord?.displayName ?? importSession.packId}
          templateHref="/api/content/import/template?example=1"
          onClose={() => {
            const { packId } = importSession;
            setImportSession(undefined);
            // A completed import created draft cards, so refresh the canonical read model.
            void loadCards(packId);
            void loadPacks();
          }}
          onPreview={async (file) => {
            const result = await sendImport(
              '/api/content/import/preview',
              file,
              importSession.packId,
            );
            if (!result.ok) return result;
            const payload = result.payload as { analysis: ImportAnalysis };
            return { ok: true as const, analysis: payload.analysis };
          }}
          onConfirm={async (file, fingerprint, selectedConflictRows) => {
            const result = await sendImport(
              '/api/content/import/confirm',
              file,
              importSession.packId,
              {
                fingerprint,
                importKey: importSession.importKey,
                // Only explicitly ticked conflict rows are sent; the server re-validates each one.
                selectedConflictRows: JSON.stringify(selectedConflictRows),
              },
            );
            if (!result.ok) return result;
            return { ok: true as const, summary: result.payload as ImportResultSummary };
          }}
        />
      ) : null}

      {aiSession ? (
        <AiPackGenerationModal
          onClose={() => {
            setAiSession(undefined);
            // Acceptance may have created a new draft pack, so refresh the canonical read model.
            void loadPacks();
          }}
          onPlan={async (prompt, model) => {
            const result = await postAiJson<{ job: GenerationJobView }>('/api/content/ai/plan', {
              prompt,
              model,
            });
            return result.ok ? { ok: true as const, job: result.payload.job } : result;
          }}
          onLoadModels={async () => {
            // Read-only catalog: a failure is not surfaced as an error, it just hides the
            // selector and leaves generation on the server's configured default.
            try {
              const response = await fetch('/api/content/ai/models', {
                credentials: 'same-origin',
                headers: { accept: 'application/json' },
              });
              if (!response.ok) return undefined;
              const payload: unknown = await response.json();
              const models = (payload as { models?: unknown })?.models;
              const defaultModel = (payload as { defaultModel?: unknown })?.defaultModel;
              if (!Array.isArray(models) || typeof defaultModel !== 'string') return undefined;
              return { models: models.map(String), defaultModel };
            } catch {
              return undefined;
            }
          }}
          onApprovePlan={async (jobId, planFingerprint) => {
            const result = await postAiJson<{ job: GenerationJobView }>(
              '/api/content/ai/plan/approve',
              { jobId, planFingerprint },
            );
            return result.ok ? { ok: true as const, job: result.payload.job } : result;
          }}
          onRunBatch={async (jobId) => {
            const result = await postAiJson<{ job: GenerationJobView }>(
              '/api/content/ai/generate',
              { jobId },
            );
            return result.ok ? { ok: true as const, job: result.payload.job } : result;
          }}
          onRefresh={async (jobId) => {
            const result = await postAiJson<{ job: GenerationJobView; analysis: ImportAnalysis }>(
              '/api/content/ai/job',
              { jobId },
            );
            return result.ok
              ? {
                  ok: true as const,
                  job: result.payload.job,
                  analysis: result.payload.analysis,
                }
              : result;
          }}
          onAccept={async (jobId, fingerprint, selectedRows) => {
            const result = await postAiJson<AcceptSummary & { created: number }>(
              '/api/content/ai/accept',
              {
                jobId,
                fingerprint,
                // Minted once per opened session, so a retried acceptance replays the same key
                // and cannot create a second copy of the accepted cards.
                acceptKey: aiSession.acceptKey,
                selectedRows,
              },
            );
            if (!result.ok) return result;
            return {
              ok: true as const,
              summary: {
                created: result.payload.created,
                skipped: result.payload.skipped,
                packId: result.payload.packId,
              },
            };
          }}
        />
      ) : null}
    </main>
  );
}
