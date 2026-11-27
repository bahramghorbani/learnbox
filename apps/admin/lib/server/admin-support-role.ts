import type { PoolClient } from 'pg';

/** Account support, including ticket content, is owner-only. */
const allowedRoles = ['super_admin'] as const;

type Queryable = Pick<PoolClient, 'query'>;

export async function hasAdminSupportRole(
  client: Queryable,
  actorUserId: string,
): Promise<boolean> {
  const result = await client.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM admin_role_assignments
        WHERE user_id = $1 AND role = ANY($2::admin_role[])
     ) AS ok`,
    [actorUserId, allowedRoles],
  );
  return result.rows[0]?.ok === true;
}
