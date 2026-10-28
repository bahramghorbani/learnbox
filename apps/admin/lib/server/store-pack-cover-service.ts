import { createHash, randomUUID } from 'node:crypto';

import type { AiMediaProvider } from './ai-media-provider';

type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = { query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult> };
type Client = Queryable & { release(): void };
type Pool = Queryable & { connect(): Promise<Client> };

export type StorePackCoverCandidate = {
  id: string;
  packId: string;
  status: 'ready' | 'accepted';
  source: 'upload' | 'ai';
  mediaType: string;
  createdAt: string;
};

function imageType(bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  return undefined;
}
function extension(type: string) {
  return type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp';
}
function view(row: Record<string, unknown>): StorePackCoverCandidate {
  return {
    id: String(row.id),
    packId: String(row.pack_id),
    status: row.status as 'ready' | 'accepted',
    source: row.source as 'upload' | 'ai',
    mediaType: String(row.media_type),
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

/** Private DB-backed candidate/acceptance boundary for optional Store covers. */
export class StorePackCoverService {
  constructor(
    private readonly pool: Pool,
    private readonly provider?: AiMediaProvider,
  ) {}
  private async publisher(client: Queryable, actor: string) {
    return (
      (
        await client.query(
          `SELECT 1 FROM admin_role_assignments WHERE user_id=$1 AND role IN ('content_publisher','super_admin')`,
          [actor],
        )
      ).rows.length > 0
    );
  }
  private async pack(client: Queryable, packId: string) {
    return (await client.query(`SELECT display_name, category FROM packs WHERE id=$1`, [packId]))
      .rows[0];
  }
  private async insert(
    client: Queryable,
    packId: string,
    bytes: Buffer,
    source: 'upload' | 'ai',
    provider?: string,
    model?: string,
  ) {
    const mediaType = imageType(bytes);
    if (!mediaType || !bytes.length || bytes.length > 8 * 1024 * 1024) return undefined;
    const key = `admin/store-covers/${packId}/${randomUUID()}.${extension(mediaType)}`;
    const checksum = createHash('sha256').update(bytes).digest('hex');
    await client.query(
      `INSERT INTO store_pack_cover_objects (object_key, media_type, byte_size, checksum, bytes) VALUES ($1,$2,$3,$4,$5)`,
      [key, mediaType, bytes.length, checksum, bytes],
    );
    const result = await client.query(
      `INSERT INTO store_pack_cover_candidates (pack_id, object_key, source, provider, model) VALUES ($1,$2,$3,$4,$5) RETURNING id, pack_id, status, source, $6::text AS media_type, created_at`,
      [packId, key, source, provider ?? null, model ?? null, mediaType],
    );
    return view(result.rows[0]!);
  }
  async state(packId: string, actor: string) {
    const client = await this.pool.connect();
    try {
      if (!(await this.publisher(client, actor))) return 'forbidden' as const;
      const rows = await client.query(
        `SELECT c.id,c.pack_id,c.status,c.source,o.media_type,c.created_at FROM store_pack_cover_candidates c JOIN store_pack_cover_objects o ON o.object_key=c.object_key WHERE c.pack_id=$1 ORDER BY c.created_at DESC LIMIT 12`,
        [packId],
      );
      return rows.rows.map(view);
    } finally {
      client.release();
    }
  }
  async upload(packId: string, actor: string, bytes: Buffer) {
    const client = await this.pool.connect();
    try {
      if (!(await this.publisher(client, actor))) return 'forbidden' as const;
      if (!(await this.pack(client, packId))) return 'not_found' as const;
      return (await this.insert(client, packId, bytes, 'upload')) ?? 'unprocessable';
    } finally {
      client.release();
    }
  }
  async generate(packId: string, actor: string) {
    const client = await this.pool.connect();
    let pack: Record<string, unknown> | undefined;
    try {
      if (!(await this.publisher(client, actor))) return 'forbidden' as const;
      pack = await this.pack(client, packId);
      if (!pack) return 'not_found' as const;
    } finally {
      client.release();
    }
    if (!this.provider) return 'unavailable' as const;
    // Prompt is wholly server-derived; the operator cannot make this a general image endpoint.
    const image = await this.provider.generateImage({
      prompt: `Square educational cover artwork for the German-learning pack “${String(pack.display_name)}”${pack.category ? `, category ${String(pack.category)}` : ''}. No text, no logos, no people.`,
      timeoutMs: 60_000,
    });
    const writer = await this.pool.connect();
    try {
      return (
        (await this.insert(writer, packId, image.bytes, 'ai', image.provider, image.model)) ??
        'unprocessable'
      );
    } finally {
      writer.release();
    }
  }
  async accept(packId: string, candidateId: string, actor: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.publisher(client, actor))) {
        await client.query('ROLLBACK');
        return 'forbidden' as const;
      }
      const candidate = await client.query(
        `SELECT c.id,c.object_key,c.status FROM store_pack_cover_candidates c WHERE c.id=$1 AND c.pack_id=$2 FOR UPDATE`,
        [candidateId, packId],
      );
      if (!candidate.rows[0]) {
        await client.query('ROLLBACK');
        return 'not_found' as const;
      }
      await client.query(
        `UPDATE store_pack_cover_candidates SET status='accepted', accepted_by_user_id=$2, accepted_at=now() WHERE id=$1`,
        [candidateId, actor],
      );
      await client.query(`UPDATE store_listings SET cover_object_key=$2 WHERE pack_id=$1`, [
        packId,
        candidate.rows[0].object_key,
      ]);
      await client.query('COMMIT');
      return 'accepted' as const;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  async read(candidateId: string, actor: string) {
    const client = await this.pool.connect();
    try {
      if (!(await this.publisher(client, actor))) return 'forbidden' as const;
      const r = await client.query(
        `SELECT o.bytes,o.media_type,o.checksum FROM store_pack_cover_candidates c JOIN store_pack_cover_objects o ON o.object_key=c.object_key WHERE c.id=$1`,
        [candidateId],
      );
      return r.rows[0]
        ? {
            bytes: Buffer.from(r.rows[0].bytes as Buffer),
            mediaType: String(r.rows[0].media_type),
            checksum: String(r.rows[0].checksum),
          }
        : ('not_found' as const);
    } finally {
      client.release();
    }
  }
}
