import { pool } from './lib.mjs';
for (const t of ['card_schedules', 'review_events', 'users']) {
  const r = await pool.query(
    'select column_name from information_schema.columns where table_name=$1 order by ordinal_position',
    [t],
  );
  console.log(t + ': ' + r.rows.map((x) => x.column_name).join(', '));
}
await pool.end();
