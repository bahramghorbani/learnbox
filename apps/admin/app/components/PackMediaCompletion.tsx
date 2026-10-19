'use client';

import { useEffect, useRef, useState } from 'react';

import {
  resumableItems,
  runPackMedia,
  scanPackMedia,
  type PackMediaItem,
  type PackMediaResult,
  type PackMediaScan,
} from './card-media-bulk';
import type { CardMediaKind, MediaKindState } from './CardMediaPanel';
import { faNum } from './fa-digits';
import { StepUpRefusedError } from './step-up-reauth';

const KIND_LABEL: Record<CardMediaKind, string> = {
  image: 'تصویر',
  word_audio: 'صدای واژه',
  sentence_audio: 'صدای مثال',
};

const RESULT_LABEL: Record<PackMediaResult['status'], string> = {
  generated: 'ساخته شد',
  not_needed: 'لازم نبود',
  in_progress: 'در حال ساخت',
  failed: 'ناموفق',
  stopped: 'اجرا نشد',
};

function countByKind(items: readonly PackMediaItem[]): string {
  return (['image', 'word_audio', 'sentence_audio'] as const)
    .map(
      (kind) => `${KIND_LABEL[kind]}: ${faNum(items.filter((item) => item.kind === kind).length)}`,
    )
    .join('، ');
}

/**
 * Whole-pack media completion: scan → estimate and confirm → sequential run → resume failures →
 * acceptance list. Generation is a paid call and runs only after the explicit confirm button;
 * acceptance always stays a separate human action in the per-card media panel.
 */
export function PackMediaCompletion({
  cards,
  loadState,
  generate,
  onOpenCard,
  onFinished,
}: {
  cards: { cardId: string; label: string }[];
  loadState: (cardId: string) => Promise<MediaKindState[] | undefined>;
  generate: (
    cardId: string,
    kind: CardMediaKind,
  ) => Promise<{ ok: boolean; status?: string; message?: string; code?: string }>;
  onOpenCard: (card: { cardId: string; label: string }) => void;
  onFinished: () => void;
}) {
  const [busy, setBusy] = useState<'scanning' | 'running'>();
  const [scanError, setScanError] = useState<string>();
  const [scan, setScan] = useState<PackMediaScan>();
  const [planned, setPlanned] = useState<PackMediaItem[]>([]);
  const [results, setResults] = useState<PackMediaResult[]>([]);
  const panelOpen = useRef(true);
  useEffect(() => {
    panelOpen.current = true;
    return () => {
      panelOpen.current = false;
    };
  }, []);

  async function rescan() {
    setBusy('scanning');
    setResults([]);
    setScanError(undefined);
    try {
      const next = await scanPackMedia(cards, loadState);
      setScan(next);
      setPlanned(next.needed);
    } catch (failure) {
      // A refused step-up (or a network failure) ends the scan; nothing is estimated or run.
      setScan(undefined);
      setScanError(
        failure instanceof StepUpRefusedError ? failure.message : 'خواندن وضعیت رسانه ناموفق بود.',
      );
    } finally {
      setBusy(undefined);
    }
  }

  async function run(items: PackMediaItem[]) {
    setBusy('running');
    setPlanned(items);
    setResults([]);
    await runPackMedia(items, {
      generate,
      onResult: (result) => {
        if (panelOpen.current) setResults((current) => [...current, result]);
      },
      shouldContinue: () => panelOpen.current,
    });
    if (!panelOpen.current) return;
    setBusy(undefined);
    onFinished();
  }

  const resumable = resumableItems(results);
  const finished = !busy && results.length > 0;

  return (
    <div className="notice" role="status" aria-live="polite" data-cp-state="pack-media">
      <div className="row">
        <strong>تکمیل رسانهٔ بسته</strong>
        <button
          className="btn"
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void rescan()}
        >
          {scan ? 'بررسی دوباره' : 'بررسی رسانه‌های لازم'}
        </button>
      </div>
      {busy === 'scanning' ? <p>در حال خواندن وضعیت رسانهٔ کارت‌ها…</p> : null}
      {scanError ? (
        <p className="notice error" role="alert">
          {scanError}
        </p>
      ) : null}

      {scan && !busy && results.length === 0 ? (
        <div data-pack-media="estimate">
          <p>
            ساخت ترتیبی فقط تا وقتی این صفحه باز است ادامه می‌یابد. اگر صفحه/بسته را ببندید یا پاسخ
            شبکه قطع شود، «تأیید و ساخت» را دوباره نزنید: با بازگشت، «بررسی دوباره» وضعیت پایدارِ
            مورد درحال‌ساخت یا پیشنهاد آماده را می‌خواند و آن را دوباره تولید نمی‌کند.
          </p>
          {scan.unreadable.length > 0 ? (
            <p className="notice error" role="alert">
              وضعیت رسانهٔ {faNum(scan.unreadable.length)} کارت خوانده نشد؛ برآورد و ساخت تا بررسی
              دوباره در دسترس نیست.
            </p>
          ) : scan.needed.length > 0 ? (
            <>
              <p>
                برآورد پیش از تأیید: {faNum(scan.needed.length)} فراخوانی پولی (
                {countByKind(scan.needed)}). رسانهٔ معتبر موجود، پیشنهادهای منتظر پذیرش و موارد
                درحال‌ساخت دوباره ساخته نمی‌شوند.
              </p>
              <button className="btn primary" type="button" onClick={() => void run(scan.needed)}>
                تأیید و ساخت {faNum(scan.needed.length)} مورد
              </button>
            </>
          ) : (
            <p>هیچ رسانه‌ای برای ساخت لازم نیست.</p>
          )}
          {scan.generating.length > 0 ? (
            <p>{faNum(scan.generating.length)} مورد هنوز در حال ساخت است.</p>
          ) : null}
          {scan.unverifiable.length > 0 ? (
            <p>
              {faNum(scan.unverifiable.length)} رسانهٔ پذیرفته‌شده منشأ قابل‌اثبات ندارد؛ بازسازی آن
              تصمیم مدیر است و خودکار انجام نمی‌شود.
            </p>
          ) : null}
        </div>
      ) : null}

      {results.length > 0 ? (
        <div data-pack-media="progress">
          <p>
            {busy === 'running' ? 'در حال ساخت ترتیبی…' : 'اجرا تمام شد.'} {faNum(results.length)}{' '}
            از {faNum(planned.length)} مورد پردازش شد؛ هیچ رسانه‌ای خودکار پذیرفته نمی‌شود.
          </p>
          <ul>
            {results.map((result) => (
              <li key={`${result.cardId}-${result.kind}`}>
                <bdi dir="ltr">{result.label}</bdi> — {KIND_LABEL[result.kind]}:{' '}
                {RESULT_LABEL[result.status]} ({result.message})
              </li>
            ))}
          </ul>
          {finished && resumable.length > 0 ? (
            <button className="btn" type="button" onClick={() => void run(resumable)}>
              ادامهٔ {faNum(resumable.length)} مورد ناموفق یا اجرانشده (فراخوانی پولی)
            </button>
          ) : null}
        </div>
      ) : null}

      {scan && scan.awaitingAcceptance.length > 0 && !busy ? (
        <div data-pack-media="acceptance">
          <p>منتظر پذیرش شما ({faNum(scan.awaitingAcceptance.length)}):</p>
          <ul>
            {scan.awaitingAcceptance.map((item) => (
              <li key={`${item.cardId}-${item.kind}`}>
                <button
                  className="btn"
                  type="button"
                  onClick={() => onOpenCard({ cardId: item.cardId, label: item.label })}
                >
                  <bdi dir="ltr">{item.label}</bdi> — {KIND_LABEL[item.kind]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {finished ? <p>برای دیدن پیشنهادهای تازه در فهرست پذیرش، «بررسی دوباره» را بزنید.</p> : null}
    </div>
  );
}
