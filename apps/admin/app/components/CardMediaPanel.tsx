'use client';

import React, { useCallback, useEffect, useState } from 'react';

/**
 * Phase 1 / Milestone 1.5 — per-card media operations.
 *
 * Deliberately a focused panel rather than an Admin redesign: it adds only the controls the
 * milestone needs, in the existing modal idiom of the Content & Packs workspace.
 *
 * States are honest. There is no fake progress bar and no placeholder media: a kind is either
 * idle, generating, holding a candidate for review, failed, or accepted. Generation alone never
 * changes what the card points at — acceptance is a separate, explicit act, and the currently
 * accepted media stays visible and intact until the Admin accepts a replacement.
 */

export type CardMediaKind = 'image' | 'word_audio' | 'sentence_audio';

export interface MediaCandidateView {
  id: string;
  kind: CardMediaKind;
  status: 'generating' | 'ready' | 'failed' | 'accepted' | 'superseded';
  mediaType: string | null;
  byteSize: number | null;
  provider: string;
  model: string;
  spokenTarget: string | null;
  voice: string | null;
  voiceRole: string | null;
  usesDieFallbackForDas: boolean;
  language: string | null;
  locale: string | null;
  imageStandardVersion: string | null;
  failureCode: string | null;
  createdAt: string;
}

export interface MediaKindState {
  kind: CardMediaKind;
  accepted: (MediaCandidateView & { acceptedAt: string }) | null;
  latestCandidate: MediaCandidateView | null;
}

export interface CardMediaPanelProps {
  cardId: string;
  cardLabel: string;
  onClose: () => void;
  onLoadState: () => Promise<MediaKindState[] | undefined>;
  onGenerate: (
    kind: CardMediaKind,
  ) => Promise<{ ok: true; candidate: MediaCandidateView } | { ok: false; message: string }>;
  onAccept: (
    kind: CardMediaKind,
    candidateId: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Builds the authenticated URL the browser uses to preview or play a candidate. */
  assetUrl: (candidateId: string) => string;
}

const KIND_LABEL: Record<CardMediaKind, string> = {
  image: 'تصویر آموزشی',
  word_audio: 'صدای واژه',
  sentence_audio: 'صدای جملهٔ نمونه',
};

const VOICE_ROLE_LABEL: Record<string, string> = {
  der_masculine: 'صدای مرد آلمانی (der)',
  die_feminine: 'صدای زن آلمانی (die)',
  das_neuter: 'صدای نوجوان آلمانی (das)',
  default_no_article: 'صدای پیش‌فرض آلمانی (بدون حرف تعریف)',
};

function formatBytes(byteSize: number | null): string {
  if (!byteSize) return '—';
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${Math.round(byteSize / 1024)} KB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

/** Attribution shown for any generated asset, so provenance is visible without opening the database. */
function Attribution({ candidate }: { candidate: MediaCandidateView }) {
  return (
    <dl className="cm-attribution">
      <div>
        <dt>سرویس</dt>
        <dd className="ltr mono">{candidate.provider}</dd>
      </div>
      <div>
        <dt>مدل</dt>
        <dd className="ltr mono">{candidate.model}</dd>
      </div>
      {candidate.spokenTarget ? (
        <div>
          <dt>متن گفته‌شده</dt>
          {/* The article is part of the pronunciation target, so it is shown verbatim. */}
          <dd className="ltr">«{candidate.spokenTarget}»</dd>
        </div>
      ) : null}
      {candidate.voiceRole ? (
        <div>
          <dt>نقش صدا</dt>
          <dd>
            {VOICE_ROLE_LABEL[candidate.voiceRole] ?? candidate.voiceRole}
            {candidate.usesDieFallbackForDas ? ' — با صدای زن (جانشین die)' : ''}
          </dd>
        </div>
      ) : null}
      {candidate.voice ? (
        <div>
          <dt>صدا</dt>
          <dd className="ltr mono">{candidate.voice}</dd>
        </div>
      ) : null}
      {candidate.locale ? (
        <div>
          <dt>زبان</dt>
          <dd className="ltr mono">{candidate.locale}</dd>
        </div>
      ) : null}
      {candidate.imageStandardVersion ? (
        <div>
          <dt>استاندارد تصویر</dt>
          <dd className="ltr mono">{candidate.imageStandardVersion}</dd>
        </div>
      ) : null}
      <div>
        <dt>حجم</dt>
        <dd className="ltr mono">{formatBytes(candidate.byteSize)}</dd>
      </div>
    </dl>
  );
}

function MediaPreview({
  candidate,
  url,
  title,
}: {
  candidate: MediaCandidateView;
  url: string;
  title: string;
}) {
  if (candidate.kind === 'image') {
    // A plain <img>: this is protected, authenticated, non-optimizable media served from an
    // Admin-only route, so the Next image optimizer must not be put in front of it.
    return <img className="cm-image-preview" src={url} alt={title} width={256} height={256} />;
  }
  return (
    <audio className="cm-audio-preview" controls preload="none" src={url} aria-label={title} />
  );
}

export function CardMediaPanel(props: CardMediaPanelProps) {
  const [state, setState] = useState<MediaKindState[] | undefined>(undefined);
  const [busyKind, setBusyKind] = useState<CardMediaKind | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    const next = await props.onLoadState();
    if (!next) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setState(next);
  }, [props]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function generate(kind: CardMediaKind) {
    setBusyKind(kind);
    setError(undefined);
    const result = await props.onGenerate(kind);
    if (!result.ok) setError(result.message);
    // Always re-read: the authoritative state is the job row, not this component's memory.
    await refresh();
    setBusyKind(undefined);
  }

  async function accept(kind: CardMediaKind, candidateId: string) {
    setBusyKind(kind);
    setError(undefined);
    const result = await props.onAccept(kind, candidateId);
    if (!result.ok) setError(result.message);
    await refresh();
    setBusyKind(undefined);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="رسانهٔ کارت">
      <div className="modal cm-modal">
        <header className="modal-head">
          <h2>
            رسانهٔ کارت <span className="ltr">{props.cardLabel}</span>
          </h2>
          <button className="btn" type="button" onClick={props.onClose}>
            بستن
          </button>
        </header>

        <p className="notice" role="note">
          تولید به‌معنی پذیرش نیست. رسانهٔ پذیرفته‌شدهٔ فعلی تا زمانی که نسخهٔ جدید را صریحاً
          بپذیرید تغییر نمی‌کند.
        </p>

        {error ? (
          <p className="notice error" role="alert">
            {error}
          </p>
        ) : null}

        {loadFailed ? (
          <p className="notice error" role="alert">
            خواندن وضعیت رسانه ناموفق بود.
          </p>
        ) : null}

        {state === undefined && !loadFailed ? <p className="notice">در حال خواندن…</p> : null}

        {state?.map((kindState) => {
          const candidate = kindState.latestCandidate;
          const isBusy = busyKind === kindState.kind;
          const isGenerating = isBusy || candidate?.status === 'generating';
          // A candidate awaiting review is one that is ready and not already the accepted asset.
          const reviewable =
            candidate && candidate.status === 'ready' && candidate.id !== kindState.accepted?.id;

          return (
            <section className="cm-kind" key={kindState.kind} data-cm-kind={kindState.kind}>
              <header className="cm-kind-head">
                <h3>{KIND_LABEL[kindState.kind]}</h3>
                <span
                  className="cm-state"
                  data-cm-state={
                    isGenerating
                      ? 'generating'
                      : reviewable
                        ? 'candidate-ready'
                        : candidate?.status === 'failed'
                          ? 'failed'
                          : kindState.accepted
                            ? 'accepted'
                            : 'idle'
                  }
                >
                  {isGenerating
                    ? 'در حال تولید…'
                    : reviewable
                      ? 'نامزد آمادهٔ بررسی'
                      : candidate?.status === 'failed'
                        ? 'ناموفق'
                        : kindState.accepted
                          ? 'پذیرفته‌شده'
                          : 'بدون رسانه'}
                </span>
              </header>

              <div className="cm-columns">
                <div className="cm-column">
                  <h4>رسانهٔ پذیرفته‌شدهٔ فعلی</h4>
                  {kindState.accepted ? (
                    <>
                      <MediaPreview
                        candidate={kindState.accepted}
                        url={props.assetUrl(kindState.accepted.id)}
                        title={`${KIND_LABEL[kindState.kind]} پذیرفته‌شده`}
                      />
                      <Attribution candidate={kindState.accepted} />
                    </>
                  ) : (
                    <p className="cm-empty">هنوز رسانه‌ای پذیرفته نشده است.</p>
                  )}
                </div>

                <div className="cm-column">
                  <h4>نامزد تولیدشده</h4>
                  {candidate?.status === 'failed' ? (
                    <p className="notice error" role="status">
                      تولید ناموفق بود
                      {candidate.failureCode ? ` (${candidate.failureCode})` : ''}. رسانهٔ
                      پذیرفته‌شدهٔ فعلی دست‌نخورده است.
                    </p>
                  ) : null}

                  {reviewable && candidate ? (
                    <>
                      <MediaPreview
                        candidate={candidate}
                        url={props.assetUrl(candidate.id)}
                        title={`${KIND_LABEL[kindState.kind]} نامزد`}
                      />
                      <Attribution candidate={candidate} />
                      <button
                        className="btn primary"
                        type="button"
                        disabled={isBusy}
                        onClick={() => void accept(kindState.kind, candidate.id)}
                      >
                        پذیرش این نامزد
                      </button>
                    </>
                  ) : !isGenerating && candidate?.status !== 'failed' ? (
                    <p className="cm-empty">نامزدی در انتظار بررسی نیست.</p>
                  ) : null}

                  <button
                    className="btn"
                    type="button"
                    disabled={isGenerating}
                    onClick={() => void generate(kindState.kind)}
                  >
                    {kindState.accepted || candidate ? 'تولید دوباره' : 'تولید'}
                  </button>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
