import {
  type ContentPackManifest,
  type LearningVocabularyItem,
  validateLearningVocabularyItem,
} from './index.js';

export type ContentReleaseActorRole = 'content_reviewer' | 'content_publisher' | 'super_admin';

export interface ContentPackReleaseReadiness {
  canRelease: boolean;
  blockers: string[];
}

/**
 * This is a pure readiness check, never a publishing command. A future authenticated admin API
 * must persist its own audit record and perform the actual state transition atomically.
 */
export function evaluateContentPackReleaseReadiness(
  manifest: ContentPackManifest,
  items: LearningVocabularyItem[],
  actorRole: ContentReleaseActorRole,
): ContentPackReleaseReadiness {
  const blockers: string[] = [];

  if (actorRole !== 'content_publisher' && actorRole !== 'super_admin') {
    blockers.push('فقط ناشر محتوا می‌تواند انتشار بسته را درخواست کند.');
  }
  if (manifest.releaseStatus !== 'staging') {
    blockers.push('بسته باید پیش از انتشار در وضعیت آماده‌سازی باشد.');
  }
  if (items.length !== manifest.targetItemCount) {
    blockers.push('تعداد آیتم‌های بسته با نسخهٔ مورد انتظار هم‌خوان نیست.');
  }

  for (const item of items) {
    if (item.status !== 'approved') {
      blockers.push(`کارت ${item.id} هنوز تأیید سردبیری نشده است.`);
      continue;
    }
    const releaseIssues = validateLearningVocabularyItem({ ...item, status: 'published' });
    if (releaseIssues.length > 0) {
      blockers.push(`کارت ${item.id} هنوز همهٔ دروازه‌های انتشار را رد نکرده است.`);
    }
  }

  return { canRelease: blockers.length === 0, blockers };
}
