type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};
type DatabasePool = {
  connect(): Promise<Queryable & { release(): void }>;
};

const packIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_PRICE_TOMANS = 100_000_000;

export type PackPriceResult =
  | { status: 'applied'; priceTomans: number }
  | { status: 'forbidden' | 'not_found' | 'locked' | 'invalid' };

/** The database function is the authority; this only maps its deliberate outcomes for HTTP. */
export class PostgresPackPriceStore {
  constructor(private readonly pool: DatabasePool) {}

  async setPrice(input: {
    packId: string;
    priceTomans: unknown;
    actorUserId: string;
  }): Promise<PackPriceResult> {
    if (!uuidPattern.test(input.actorUserId)) throw new Error('Actor user id is invalid.');
    const packId = input.packId.trim().toLowerCase();
    const priceTomans = Number(input.priceTomans);
    if (
      !packIdPattern.test(packId) ||
      !Number.isInteger(priceTomans) ||
      priceTomans < 1 ||
      priceTomans > MAX_PRICE_TOMANS
    ) {
      return { status: 'invalid' };
    }
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT admin_set_pack_price($1, $2, $3) AS price_tomans', [
        packId,
        priceTomans,
        input.actorUserId,
      ]);
      return { status: 'applied', priceTomans: Number(result.rows[0]?.price_tomans) };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === '42501') return { status: 'forbidden' };
      if (code === 'P0002') return { status: 'not_found' };
      if (code === '55000') return { status: 'locked' };
      if (code === '22023') return { status: 'invalid' };
      throw error;
    } finally {
      client.release();
    }
  }
}
