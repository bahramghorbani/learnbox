const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const dictionaryEditorialStatuses = ['queued', 'approved', 'deleted'] as const;
export type DictionaryEditorialStatus = (typeof dictionaryEditorialStatuses)[number];
type Row = Record<string, unknown>;
type Client = {
  query(sql: string, parameters?: readonly unknown[]): Promise<{ rows: Row[] }>;
  release(): void;
};
type Pool = { connect(): Promise<Client> };

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
  async list(
    actor: string,
  ): Promise<{ status: 'ok'; items: DictionaryEditorialEntry[] } | { status: 'forbidden' }> {
    if (!uuidPattern.test(actor)) throw new Error('Actor user id is invalid.');
    const client = await this.pool.connect();
    try {
      if (!(await this.superAdmin(client, actor))) return { status: 'forbidden' };
      const rows =
        await client.query(`SELECT id, dictionary_key, ai_payload, manual_payload, status, revision, source, model, cost_metadata, created_at, updated_at
        FROM dictionary_editorial_entries ORDER BY updated_at DESC, id DESC`);
      return { status: 'ok', items: rows.rows.map(entry) };
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
          `SELECT id, dictionary_key, ai_payload, manual_payload, status, revision, source, model, cost_metadata, created_at, updated_at FROM dictionary_editorial_entries WHERE id = $1`,
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
        `INSERT INTO dictionary_editorial_entries (dictionary_key, ai_payload, source, model, cost_metadata, created_by_user_id, updated_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id, dictionary_key, ai_payload, manual_payload, status, revision, source, model, cost_metadata, created_at, updated_at`,
        [
          input.dictionaryKey,
          input.aiPayload,
          input.source,
          input.model,
          input.costMetadata,
          actor,
        ],
      );
      const item = entry(inserted.rows[0]!);
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'dictionary_editorial.create', 'dictionary_editorial_entry', $2, jsonb_build_object('idempotency_key', $3::uuid, 'dictionary_key', $4))`,
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
          `SELECT id, dictionary_key, ai_payload, manual_payload, status, revision, source, model, cost_metadata, created_at, updated_at FROM dictionary_editorial_entries WHERE id = $1`,
          [replay.rows[0].entity_id],
        );
        await client.query('ROLLBACK');
        return { status: 'idempotent' as const, item: entry(row.rows[0]!) };
      }
      const updated = await client.query(
        `UPDATE dictionary_editorial_entries SET manual_payload = CASE WHEN $1 THEN $2 ELSE manual_payload END, status = COALESCE($3, status), revision = revision + 1, updated_by_user_id = $4, updated_at = now()
        WHERE id = $5 AND revision = $6 RETURNING id, dictionary_key, ai_payload, manual_payload, status, revision, source, model, cost_metadata, created_at, updated_at`,
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
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'dictionary_editorial.update', 'dictionary_editorial_entry', $2, jsonb_build_object('idempotency_key', $3::uuid, 'revision', $4))`,
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
