'use client';

import type { ContentPackManifest, LearningVocabularyItem } from '@learnbox/content-models';

import { evaluateContentPackReleaseReadiness } from '@learnbox/content-models';

interface PackReleasePanelProps {
  manifest: ContentPackManifest;
  items: LearningVocabularyItem[];
  actorRole: 'content_reviewer' | 'content_publisher' | 'super_admin';
}

/**
 * Shows the readiness of a content pack for release. This panel is intentionally
 * display-only: it never publishes, schedules or writes state. A real release
 * transition belongs to a future authenticated admin API that persists its own
 * audit record.
 */
export function PackReleasePanel({ manifest, items, actorRole }: PackReleasePanelProps) {
  const readiness = evaluateContentPackReleaseReadiness(manifest, items, actorRole);

  return (
    <section className="pack-release-panel" aria-labelledby="pack-release-title">
      <div className="pack-release-heading">
        <span aria-hidden="true">◇</span>
        <h2 id="pack-release-title">وضعیت انتشار بسته</h2>
      </div>

      <dl className="pack-release-summary">
        <div>
          <dt>بسته</dt>
          <dd lang="en" dir="ltr">
            {manifest.id}
          </dd>
        </div>
        <div>
          <dt>نسخه</dt>
          <dd>v{manifest.version}</dd>
        </div>
        <div>
          <dt>وضعیت</dt>
          <dd>{manifest.releaseStatus}</dd>
        </div>
        <div>
          <dt>کارت‌ها</dt>
          <dd>
            {items.length} / {manifest.targetItemCount}
          </dd>
        </div>
      </dl>

      {readiness.canRelease ? (
        <p className="release-ready" role="status">
          بسته برای انتشار آماده است.
        </p>
      ) : (
        <div className="release-blockers" role="status">
          <p>انتشار بسته هنوز ممکن نیست:</p>
          <ul>
            {readiness.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      )}

      <button className="release-button" type="button" disabled>
        درخواست انتشار (غیرفعال)
      </button>
      <p className="release-disabled-note" role="note">
        انتشار واقعی پس از اتصال پنل مدیریت تأییدشده فعال می‌شود.
      </p>
    </section>
  );
}
