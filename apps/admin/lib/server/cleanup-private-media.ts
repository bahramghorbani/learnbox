type CleanupJob = { id: string; objectKey: string; attemptCount: number };

type CleanupStore = {
  claimCleanupJobs(input: { now: Date; limit: number }): Promise<CleanupJob[]>;
  completeCleanup(id: string, now: Date): Promise<void>;
  rescheduleCleanup(input: {
    id: string;
    attemptCount: number;
    nextAttemptAt: Date;
    lastErrorCode: 'delete_failed';
  }): Promise<void>;
  exhaustCleanup(input: {
    id: string;
    attemptCount: number;
    completedAt: Date;
    lastErrorCode: 'delete_failed_exhausted';
  }): Promise<void>;
};

type CleanupStorage = { delete(objectKey: string): Promise<void> };

export async function cleanupPrivateMedia(
  input: { now: Date; limit?: number },
  dependencies: { store: CleanupStore; storage: CleanupStorage },
): Promise<{ completed: number; rescheduled: number; exhausted: number }> {
  const jobs = await dependencies.store.claimCleanupJobs({
    now: input.now,
    limit: input.limit ?? 10,
  });
  let completed = 0;
  let rescheduled = 0;
  let exhausted = 0;
  for (const job of jobs) {
    try {
      await dependencies.storage.delete(job.objectKey);
      await dependencies.store.completeCleanup(job.id, input.now);
      completed += 1;
    } catch {
      if (job.attemptCount >= 5) {
        await dependencies.store.exhaustCleanup({
          id: job.id,
          attemptCount: job.attemptCount,
          completedAt: input.now,
          lastErrorCode: 'delete_failed_exhausted',
        });
        exhausted += 1;
      } else {
        const backoffMinutes = Math.min(60, 5 * 2 ** Math.max(0, job.attemptCount - 1));
        await dependencies.store.rescheduleCleanup({
          id: job.id,
          attemptCount: job.attemptCount,
          nextAttemptAt: new Date(input.now.getTime() + backoffMinutes * 60_000),
          lastErrorCode: 'delete_failed',
        });
        rescheduled += 1;
      }
    }
  }
  return { completed, rescheduled, exhausted };
}
