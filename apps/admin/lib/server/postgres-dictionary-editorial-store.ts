const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const dictionaryEditorialStatuses = ['queued', 'approved', 'deleted'] as const;
export type DictionaryEditorialStatus = (typeof dictionaryEditorialStatuses)[number];
type Row = Record<string, unknown>;
type Client = {
  query(sql: string, parameters?: readonly unknown[]): Promise<{ rows: Row[] }>;
  release(): void;
};
type Pool = { connect(): Promise<Client> };
const columns =
  'id, dictionary_key, ai_payload, manual_payload, status, revision, source, model, cost_metadata, created_at, updated_at';
export const dictionaryEditorialFilters = ['all', 'review', 'ai', 'deleted'] as const;
export type DictionaryEditorialQuery = {
  q: string;
  filter: (typeof dictionaryEditorialFilters)[number];
  limit: number;
};

export type DictionaryEditorialEntry = {
  id: string;
  dictionaryKey: string;
  aiPayload: Record<string, unknown>;
  manualPayload: Record<string, unknown> | null;
  status: DictionaryEditorialStatus;
  revision: number;
  source: string;
  model: string | null;
  costMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function entry(row: Row): DictionaryEditorialEntry {
  return {
    id: String(row.id),
    dictionaryKey: String(row.dictionary_key),
    aiPayload: row.ai_payload as Record<string, unknown>,
    manualPayload: row.manual_payload as Record<string, unknown> | null,
    status: row.status as DictionaryEditorialStatus,
    revision: Number(row.revision),
    source: String(row.source),
    model: row.model === null ? null : String(row.model),
    costMetadata: row.cost_metadata as Record<string, unknown>,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export class PostgresDictionaryEditorialStore {
  private readonly pool: Pool;
  constructor(pool: Pool) {
    this.pool = pool;
  }
  private async superAdmin(client: Client, actor: string) {
    const result = await client.query(
      "SELECT 1 FROM admin_role_assignments WHERE user_id = $1 AND role = 'super_admin'",
      [actor],
    );
    return result.rows.length > 0;
  }
  private async replay(client: Client, action: string, key: string) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
    return client.query(
      "SELECT entity_id FROM audit_logs WHERE action = $1 AND metadata->>'idempotency_key' = $2",
      [action, key],
    );
  }
  /**
   * Without a query: every row (release export). With one: a bounded search page for the Admin UI —
   * the table holds the whole published dictionary, so the route never returns it unbounded.
   */
  async list(
    actor: string,
    query?: DictionaryEditorialQuery,
  ): Promise<
    { status: 'ok'; items: DictionaryEditorialEntry[]; total: number } | { status: 'forbidden' }
  > {
    if (!uuidPattern.test(actor)) throw new Error('Actor user id is invalid.');
    const client = await this.pool.connect();
    try {
      if (!(await this.superAdmin(client, actor))) return { status: 'forbidden' };
      if (!query) {
        const rows = await client.query(
          `SELECT ${columns} FROM dictionary_editorial_entries ORDER BY updated_at DESC, id DESC`,
        );
        return { status: 'ok', items: rows.rows.map(entry), total: rows.rows.length };
      }
      const like = query.q.replace(/[\\%_]/g, (c) => `\\${c}`);
      // ponytail: sequential scan over ~22k JSONB rows (tens of ms); add a trigram index if it grows 10x.
      const rows = await client.query(
        `SELECT ${columns}, count(*) OVER () AS total FROM dictionary_editorial_entries
        WHERE ($1::text = '' OR dictionary_key ILIKE $2::text OR (coalesce(manual_payload, ai_payload)->'senses')::text ILIKE $3::text)
          AND CASE $4::text
            WHEN 'review' THEN status <> 'deleted' AND manual_payload IS NULL AND cost_metadata->>'reviewVerdict' = 'fixed'
            WHEN 'ai' THEN status <> 'deleted' AND model IS NOT NULL
            WHEN 'deleted' THEN status = 'deleted'
            ELSE status <> 'deleted' END
        ORDER BY lower(dictionary_key) = lower($1::text) DESC, dictionary_key ILIKE $2::text DESC,
          CASE WHEN $1::text = '' THEN updated_at END DESC,
          coalesce((ai_payload->>'freq')::int, 0) DESC, length(dictionary_key), dictionary_key
        LIMIT $5::int`,
        [query.q, `${like}%`, `%${like}%`, query.filter, query.limit],
      );
      return {
        status: 'ok',
        items: rows.rows.map(entry),
        total: Number(rows.rows[0]?.total ?? 0),
      };
    } finally {
      client.release();
    }
  }
  /** Every row with its effective payload, for building a public release. */
  async releaseRows(actor: string): Promise<
    | {
        status: 'ok';
        rows: {
          dictionaryKey: string;
          status: DictionaryEditorialStatus;
          payload: Record<string, unknown>;
        }[];
      }
    | { status: 'forbidden' }
  > {
    if (!uuidPattern.test(actor)) throw new Error('Actor user id is invalid.');
    const client = await this.pool.connect();
    try {
      if (!(await this.superAdmin(client, actor))) return { status: 'forbidden' };
      const result = await client.query(
        'SELECT dictionary_key, status, coalesce(manual_payload, ai_payload) AS payload FROM dictionary_editorial_entries ORDER BY dictionary_key',
      );
      return {
        status: 'ok',
        rows: result.rows.map((r) => ({
          dictionaryKey: String(r.dictionary_key),
          status: r.status as DictionaryEditorialStatus,
          payload: r.payload as Record<string, unknown>,
        })),
      };
    } finally {
      client.release();
    }
  }
  /** How many words changed in the panel after `since` (what the next release would pick up). */
  async changedSince(actor: string, since: string | null) {
    if (!uuidPattern.test(actor)) throw new Error('Actor user id is invalid.');
    const client = await this.pool.connect();
    try {
      if (!(await this.superAdmin(client, actor))) return { status: 'forbidden' as const };
      const result = await client.query(
        "SELECT count(*)::int AS n FROM dictionary_editorial_entries WHERE status <> 'queued' AND ($1::timestamptz IS NULL OR updated_at > $1::timestamptz)",
        [since],
      );
      return { status: 'ok' as const, changed: Number(result.rows[0]?.n ?? 0) };
    } finally {
      client.release();
    }
  }
  /**
   * Live words whose current meaning has exactly one sense, highest-frequency first. These are
   * the candidates for an AI-proposed additional sense (card generation's second-review pattern:
   * a reviewer call must confirm a proposal before it is written at all).
   */
  async singleSenseWordsNeedingSecondSense(
    actor: string,
    limit: number,
  ): Promise<
    | {
        status: 'ok';
        items: { id: string; dictionaryKey: string; revision: number; payload: Row }[];
      }
    | { status: 'forbidden' }
  > {
    if (!uuidPattern.test(actor)) throw new Error('Actor user id is invalid.');
    const client = await this.pool.connect();
    try {
      if (!(await this.superAdmin(client, actor))) return { status: 'forbidden' };
      const rows = await client.query(
        `SELECT id, dictionary_key, revision, coalesce(manual_payload, ai_payload) AS payload
        FROM dictionary_editorial_entries
        WHERE status <> 'deleted'
          AND jsonb_typeof(coalesce(manual_payload, ai_payload)->'senses') = 'array'
          AND jsonb_array_length(coalesce(manual_payload, ai_payload)->'senses') = 1
        ORDER BY coalesce((coalesce(manual_payload, ai_payload)->>'freq')::int, 0) DESC, dictionary_key
        LIMIT $1::int`,
        [limit],
      );
      return {
        status: 'ok',
        items: rows.rows.map((r) => ({
          id: String(r.id),
          dictionaryKey: String(r.dictionary_key),
          revision: Number(r.revision),
          payload: r.payload as Row,
        })),
      };
    } finally {
      client.release();
    }
  }
  /**
   * Live words whose German example sentences have no Persian translation, highest-frequency
   * first — the pilot's candidate pool. `limit` bounds words fetched, not sentences; the caller
   * flattens and caps sentences itself, since one word may contribute more than one.
   */
  async examplesNeedingTranslation(
    actor: string,
    limit: number,
  ): Promise<
    | {
        status: 'ok';
        items: { id: string; dictionaryKey: string; revision: number; payload: Row }[];
      }
    | { status: 'forbidden' }
  > {
    if (!uuidPattern.test(actor)) throw new Error('Actor user id is invalid.');
    const client = await this.pool.connect();
    try {
      if (!(await this.superAdmin(client, actor))) return { status: 'forbidden' };
      const rows = await client.query(
        `SELECT id, dictionary_key, revision, coalesce(manual_payload, ai_payload) AS payload
        FROM dictionary_editorial_entries
        WHERE status <> 'deleted'
          AND jsonb_typeof(coalesce(manual_payload, ai_payload)->'examples') = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(coalesce(manual_payload, ai_payload)->'examples') e
            WHERE nullif(trim(e->>'de'), '') IS NOT NULL
              AND nullif(trim(coalesce(e->>'fa', '')), '') IS NULL
          )
        ORDER BY coalesce((coalesce(manual_payload, ai_payload)->>'freq')::int, 0) DESC, dictionary_key
        LIMIT $1::int`,
        [limit],
      );
      return {
        status: 'ok',
        items: rows.rows.map((r) => ({
          id: String(r.id),
          dictionaryKey: String(r.dictionary_key),
          revision: Number(r.revision),
          payload: r.payload as Row,
        })),
      };
    } finally {
      client.release();
    }
  }
  /** Audit trail for publish and rollback; the release files themselves live outside the database. */
  async recordRelease(
    actor: string,
    input: {
      action: 'publish' | 'rollback';
      id: string;
      file: string;
      sha256: string;
      entries: number;
    },
  ) {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2::text, 'dictionary_release', $3::uuid, jsonb_build_object('file', $4::text, 'sha256', $5::text, 'entries', $6::int))`,
        [
          actor,
          `dictionary_release.${input.action}`,
          input.id,
          input.file,
          input.sha256,
          input.entries,
        ],
      );
    } finally {
      client.release();
    }
  }
  /** Bulk-load already-published entries as approved. Existing keys are left untouched. */
  async seed(
    actor: string,
    input: {
      records: { dictionaryKey: string; payload: Record<string, unknown> }[];
      source: string;
      idempotencyKey: string;
    },
  ) {
    if (!uuidPattern.test(actor) || !uuidPattern.test(input.idempotencyKey))
      throw new Error('Invalid identity.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.superAdmin(client, actor))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' as const };
      }
      const replay = await this.replay(client, 'dictionary_editorial.seed', input.idempotencyKey);
      if (replay.rows[0]) {
        await client.query('ROLLBACK');
        return { status: 'idempotent' as const, inserted: 0 };
      }
      const result = await client.query(
        `WITH ins AS (
          INSERT INTO dictionary_editorial_entries (dictionary_key, ai_payload, status, source, created_by_user_id, updated_by_user_id)
          SELECT r->>'dictionaryKey', r->'payload', 'approved', $2::text, $3::uuid, $3::uuid
          FROM jsonb_array_elements($1::jsonb) r
          ON CONFLICT (dictionary_key) DO NOTHING RETURNING 1)
        SELECT count(*)::int AS inserted FROM ins`,
        [JSON.stringify(input.records), input.source, actor],
      );
      const inserted = Number(result.rows[0]!.inserted);
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'dictionary_editorial.seed', 'dictionary_editorial_seed', $2::uuid, jsonb_build_object('idempotency_key', $2::uuid, 'source', $3::text, 'records', $4::int, 'inserted', $5::int))`,
        [actor, input.idempotencyKey, input.source, input.records.length, inserted],
      );
      await client.query('COMMIT');
      return { status: 'applied' as const, inserted };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async create(
    actor: string,
    input: {
      dictionaryKey: string;
      aiPayload: Record<string, unknown>;
      source: string;
      model: string | null;
      costMetadata: Record<string, unknown>;
      status?: 'queued' | 'approved';
      idempotencyKey: string;
    },
  ) {
    if (!uuidPattern.test(actor) || !uuidPattern.test(input.idempotencyKey))
      throw new Error('Invalid identity.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.superAdmin(client, actor))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' as const };
      }
      const replay = await this.replay(client, 'dictionary_editorial.create', input.idempotencyKey);
      if (replay.rows[0]) {
        const row = await client.query(
          `SELECT ${columns} FROM dictionary_editorial_entries WHERE id = $1`,
          [replay.rows[0].entity_id],
        );
        await client.query('ROLLBACK');
        return { status: 'idempotent' as const, item: entry(row.rows[0]!) };
      }
      // One editorial record owns a lemma; later AI runs update/requeue it rather than creating
      // competing approved meanings for the same public dictionary key.
      const existing = await client.query(
        'SELECT 1 FROM dictionary_editorial_entries WHERE dictionary_key = $1',
        [input.dictionaryKey],
      );
      if (existing.rows[0]) {
        await client.query('ROLLBACK');
        return { status: 'duplicate' as const };
      }
      const inserted = await client.query(
        `INSERT INTO dictionary_editorial_entries (dictionary_key, ai_payload, source, model, cost_metadata, created_by_user_id, updated_by_user_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, $6, $7::text) RETURNING ${columns}`,
        [
          input.dictionaryKey,
          input.aiPayload,
          input.source,
          input.model,
          input.costMetadata,
          actor,
          input.status ?? 'queued',
        ],
      );
      const item = entry(inserted.rows[0]!);
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'dictionary_editorial.create', 'dictionary_editorial_entry', $2, jsonb_build_object('idempotency_key', $3::uuid, 'dictionary_key', $4::text))`,
        [actor, item.id, input.idempotencyKey, input.dictionaryKey],
      );
      await client.query('COMMIT');
      return { status: 'applied' as const, item };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async update(
    actor: string,
    id: string,
    input: {
      revision: number;
      manualPayload?: Record<string, unknown> | null;
      status?: DictionaryEditorialStatus;
      idempotencyKey: string;
    },
  ) {
    if (
      !uuidPattern.test(actor) ||
      !uuidPattern.test(id) ||
      !uuidPattern.test(input.idempotencyKey)
    )
      throw new Error('Invalid identity.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.superAdmin(client, actor))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' as const };
      }
      const replay = await this.replay(client, 'dictionary_editorial.update', input.idempotencyKey);
      if (replay.rows[0]) {
        const row = await client.query(
          `SELECT ${columns} FROM dictionary_editorial_entries WHERE id = $1`,
          [replay.rows[0].entity_id],
        );
        await client.query('ROLLBACK');
        return { status: 'idempotent' as const, item: entry(row.rows[0]!) };
      }
      const updated = await client.query(
        `UPDATE dictionary_editorial_entries SET manual_payload = CASE WHEN $1 THEN $2 ELSE manual_payload END, status = COALESCE($3, status), revision = revision + 1, updated_by_user_id = $4, updated_at = now()
        WHERE id = $5 AND revision = $6 RETURNING ${columns}`,
        [
          Object.hasOwn(input, 'manualPayload'),
          input.manualPayload ?? null,
          input.status ?? null,
          actor,
          id,
          input.revision,
        ],
      );
      if (!updated.rows[0]) {
        const exists = await client.query(
          'SELECT 1 FROM dictionary_editorial_entries WHERE id = $1',
          [id],
        );
        await client.query('ROLLBACK');
        return { status: exists.rows[0] ? ('conflict' as const) : ('not_found' as const) };
      }
      const item = entry(updated.rows[0]);
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'dictionary_editorial.update', 'dictionary_editorial_entry', $2, jsonb_build_object('idempotency_key', $3::uuid, 'revision', $4::int))`,
        [actor, id, input.idempotencyKey, item.revision],
      );
      await client.query('COMMIT');
      return { status: 'applied' as const, item };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
