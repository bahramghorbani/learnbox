import { createHash, randomUUID } from 'node:crypto';

export type NormalizedSplashCandidate = {
  bytes: Buffer;
  checksum: string;
  width: number;
  height: number;
  byteSize: number;
  mediaType: 'image/webp';
};

export type SplashReplacementStore = {
  reserveReplacement(input: {
    idempotencyKeyHash: string;
    now: Date;
  }): Promise<
    | { status: 'reserved'; actionId: string }
    | { status: 'completed'; versionId: string }
    | { status: 'in_progress' }
  >;
  promoteReplacement(input: {
    actionId: string;
    versionId: string;
    objectKey: string;
    candidate: NormalizedSplashCandidate;
    now: Date;
  }): Promise<{
    status: 'promoted';
    versionId: string;
    previousObjectKey?: string;
  }>;
  abandonReplacement(actionId: string): Promise<void>;
  queueCleanup(input: {
    objectKey: string;
    reasonCode: 'candidate_after_transaction_failure' | 'superseded_after_promotion';
    now: Date;
  }): Promise<void>;
};

export type PrivateSplashStorage = {
  upload(objectKey: string, bytes: Buffer, contentType: 'image/webp'): Promise<void>;
  delete(objectKey: string): Promise<void>;
};

type ReplaceSplashInput = {
  candidate: NormalizedSplashCandidate;
  idempotencyKey: string;
  now: Date;
};

type ReplaceSplashDependencies = {
  storage: PrivateSplashStorage;
  store: SplashReplacementStore;
  createId?: () => string;
};

export type SplashReplacementFailureCode =
  'storage_unavailable' | 'persistence_unavailable' | 'cleanup_tracking_failed';

export class SplashReplacementError extends Error {
  constructor(readonly code: SplashReplacementFailureCode) {
    super('Splash replacement failed.');
    this.name = 'SplashReplacementError';
  }
}

export async function replaceSplash(
  input: ReplaceSplashInput,
  dependencies: ReplaceSplashDependencies,
): Promise<
  | { status: 'replaced'; versionId: string }
  | { status: 'idempotent'; versionId: string }
  | { status: 'in_progress' }
> {
  const reservation = await dependencies.store.reserveReplacement({
    idempotencyKeyHash: createHash('sha256').update(input.idempotencyKey).digest('hex'),
    now: input.now,
  });
  if (reservation.status === 'completed') {
    return { status: 'idempotent', versionId: reservation.versionId };
  }
  if (reservation.status === 'in_progress') return reservation;

  const versionId = (dependencies.createId ?? randomUUID)();
  const objectKey = `admin/splash/${versionId}.webp`;
  try {
    await dependencies.storage.upload(objectKey, input.candidate.bytes, input.candidate.mediaType);
  } catch {
    try {
      await dependencies.store.abandonReplacement(reservation.actionId);
    } catch {
      throw new SplashReplacementError('persistence_unavailable');
    }
    throw new SplashReplacementError('storage_unavailable');
  }
  let promoted: Awaited<ReturnType<SplashReplacementStore['promoteReplacement']>>;
  try {
    promoted = await dependencies.store.promoteReplacement({
      actionId: reservation.actionId,
      versionId,
      objectKey,
      candidate: input.candidate,
      now: input.now,
    });
  } catch {
    let cleanupTrackingFailed = false;
    try {
      await dependencies.storage.delete(objectKey);
    } catch {
      try {
        await dependencies.store.queueCleanup({
          objectKey,
          reasonCode: 'candidate_after_transaction_failure',
          now: input.now,
        });
      } catch {
        cleanupTrackingFailed = true;
      }
    }
    try {
      await dependencies.store.abandonReplacement(reservation.actionId);
    } catch {
      throw new SplashReplacementError('persistence_unavailable');
    }
    if (cleanupTrackingFailed) {
      throw new SplashReplacementError('cleanup_tracking_failed');
    }
    throw new SplashReplacementError('persistence_unavailable');
  }
  if (promoted.previousObjectKey) {
    try {
      await dependencies.storage.delete(promoted.previousObjectKey);
    } catch {
      try {
        await dependencies.store.queueCleanup({
          objectKey: promoted.previousObjectKey,
          reasonCode: 'superseded_after_promotion',
          now: input.now,
        });
      } catch {
        throw new SplashReplacementError('cleanup_tracking_failed');
      }
    }
  }
  return { status: 'replaced', versionId: promoted.versionId };
}
