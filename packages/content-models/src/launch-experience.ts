import type { ContentValidationIssue } from './index.js';

export type LaunchExperienceKind = 'launch_screen' | 'install_icon';
export type LaunchExperienceStatus =
  'draft' | 'approved' | 'scheduled' | 'active' | 'expired' | 'rejected';
export type LaunchPublisherRole = 'content_publisher' | 'super_admin';

export interface LaunchExperienceAsset {
  path: string;
  checksumSha256: string;
  width: number;
  height: number;
  focalPoint?: { x: number; y: number };
}

export interface LaunchExperienceRecord {
  id: string;
  kind: LaunchExperienceKind;
  status: LaunchExperienceStatus;
  asset: LaunchExperienceAsset;
  startsAt?: string;
  endsAt?: string;
  fallbackId: string;
}

export interface LaunchPublicationReadiness {
  canPublish: boolean;
  blockers: string[];
}

const opaqueId = /^[a-z0-9][a-z0-9-]{2,63}$/;
const sha256 = /^[a-f0-9]{64}$/;

function validUtcDate(value: string | undefined) {
  return Boolean(value && /Z$/.test(value) && Number.isFinite(Date.parse(value)));
}

/**
 * Validates a draft selected by a future authenticated admin API. It validates
 * metadata only: uploads, authorization and persistence remain server concerns.
 */
export function validateLaunchExperience(record: LaunchExperienceRecord): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  if (!opaqueId.test(record.id)) {
    issues.push({ field: 'id', message: 'شناسهٔ تجربهٔ آغاز معتبر نیست.' });
  }
  if (!opaqueId.test(record.fallbackId) || record.fallbackId === record.id) {
    issues.push({ field: 'fallbackId', message: 'نسخهٔ بازگشت باید معتبر و متفاوت باشد.' });
  }
  if (!sha256.test(record.asset.checksumSha256)) {
    issues.push({ field: 'asset.checksumSha256', message: 'هش SHA-256 رسانه معتبر نیست.' });
  }
  if (!Number.isInteger(record.asset.width) || !Number.isInteger(record.asset.height)) {
    issues.push({ field: 'asset.dimensions', message: 'ابعاد رسانه باید عدد صحیح باشند.' });
  }

  const expectedPath = record.kind === 'launch_screen' ? '/images/launch/' : '/icons/';
  if (!record.asset.path.startsWith(expectedPath)) {
    issues.push({ field: 'asset.path', message: 'مسیر رسانه با نوع تجربه سازگار نیست.' });
  }

  if (record.kind === 'launch_screen') {
    const ratio = record.asset.width / record.asset.height;
    if (record.asset.width < 864 || record.asset.height < 1600 || ratio < 0.42 || ratio > 0.55) {
      issues.push({ field: 'asset.dimensions', message: 'اسپلش باید عمودی و مناسب موبایل باشد.' });
    }
  } else if (
    record.asset.width !== record.asset.height ||
    record.asset.width < 512 ||
    record.asset.height < 512
  ) {
    issues.push({ field: 'asset.dimensions', message: 'آیکون باید مربع و دست‌کم ۵۱۲ پیکسل باشد.' });
  }

  if (record.asset.focalPoint) {
    const { x, y } = record.asset.focalPoint;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
      issues.push({
        field: 'asset.focalPoint',
        message: 'نقطهٔ کانونی باید درصدی بین صفر تا صد باشد.',
      });
    }
  }

  if (record.startsAt && !validUtcDate(record.startsAt)) {
    issues.push({ field: 'startsAt', message: 'زمان شروع باید ISO و بر پایهٔ UTC باشد.' });
  }
  if (record.endsAt && !validUtcDate(record.endsAt)) {
    issues.push({ field: 'endsAt', message: 'زمان پایان باید ISO و بر پایهٔ UTC باشد.' });
  }
  if (
    validUtcDate(record.startsAt) &&
    validUtcDate(record.endsAt) &&
    Date.parse(record.endsAt!) <= Date.parse(record.startsAt!)
  ) {
    issues.push({ field: 'endsAt', message: 'زمان پایان باید پس از زمان شروع باشد.' });
  }
  if (record.status === 'scheduled' && !record.startsAt) {
    issues.push({ field: 'startsAt', message: 'نسخهٔ زمان‌بندی‌شده زمان شروع می‌خواهد.' });
  }

  return issues;
}

/** This is a pure gate; only a future server transaction can actually publish. */
export function evaluateLaunchPublicationReadiness(
  record: LaunchExperienceRecord,
  actorRole: LaunchPublisherRole | 'content_reviewer',
): LaunchPublicationReadiness {
  const blockers = validateLaunchExperience(record).map((issue) => issue.message);
  if (actorRole !== 'content_publisher' && actorRole !== 'super_admin') {
    blockers.push('فقط ناشر مجاز می‌تواند تجربهٔ آغاز را منتشر یا زمان‌بندی کند.');
  }
  if (record.status !== 'approved' && record.status !== 'scheduled') {
    blockers.push('فقط نسخهٔ تأییدشده یا زمان‌بندی‌شده برای انتشار آماده است.');
  }
  return { canPublish: blockers.length === 0, blockers };
}
