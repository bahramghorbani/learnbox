-- Explicit operator resolution for a provider outcome that cannot be recovered safely.
-- A deferred item remains unresolved; it is never counted as generated/not-needed.

ALTER TABLE pack_media_jobs
  DROP CONSTRAINT pack_media_jobs_status_check,
  ADD CONSTRAINT pack_media_jobs_status_check CHECK (
    status IN ('queued', 'running', 'stopped', 'completed', 'completed_with_deferred', 'needs_attention')
  );

ALTER TABLE pack_media_job_items
  DROP CONSTRAINT pack_media_job_items_status_check,
  ADD CONSTRAINT pack_media_job_items_status_check CHECK (
    status IN (
      'pending', 'leased', 'dispatching', 'generated', 'not_needed',
      'in_progress', 'needs_attention', 'deferred', 'stopped'
    )
  );

DROP INDEX IF EXISTS pack_media_jobs_one_active_per_actor_pack;
CREATE UNIQUE INDEX IF NOT EXISTS pack_media_jobs_one_active_per_actor_pack
  ON pack_media_jobs (actor_user_id, pack_id) WHERE status IN ('queued', 'running', 'needs_attention', 'completed_with_deferred');
