// LB-B30 Production credential-cutover regression/security matrix. Runs INSIDE the learner container.
// Real HTTPS requests to the public origin. Synthetic user only (b4efb0a4); owner (451b0433) is never
// used as a session subject, never mutated; its row/schedule/review hashes are compared before/after.
// Secrets are read from the container env and never printed.
import { createRequire } from 'node:module';
import { createHmac, randomUUID } from 'node:crypto';
import fs from 'node:fs';
const require = createRequire(
  '/app/node_modules/.pnpm/' +
    fs.readdirSync('/app/node_modules/.pnpm').find((d) => d.startsWith('pg@')) +
    '/node_modules/pg/',
);
const pg = require('.');
const B = 'https://app.learnboxapp.com';
const OWNER = '451b0433-7204-44e9-957f-250cac59e28e';
const TEST = 'b4efb0a4-d829-4f33-b686-0f498fbef62c';
const u = new URL(process.env.DATABASE_URL);
u.searchParams.set('sslmode', 'verify-full');
const db = new pg.Client({ connectionString: u.toString() });
await db.connect();
const q = async (s, p) => (await db.query(s, p)).rows;
const role = (await q('select current_user r'))[0].r;

let pass = 0,
  fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) pass++;
  else fail++;
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : ''));
};
ok('learner connects as learnbox_app (not owner)', role === 'learnbox_app', 'role=' + role);

const snap = async () => ({
  owner: (
    await q(
      `select (select md5(u::text) from users u where id=$1) uh,
     (select count(*)::int||':'||coalesce(md5(string_agg(t::text,',' order by t::text)),'') from (select * from card_schedules where user_id=$1) t) cs,
     (select count(*)::int||':'||coalesce(md5(string_agg(t::text,',' order by t::text)),'') from (select * from review_events where user_id=$1) t) re`,
      [OWNER],
    )
  )[0],
  test: (
    await q(
      `select (select count(*)::int from review_events where user_id=$1) re,(select count(*)::int from card_schedules where user_id=$1) cs`,
      [TEST],
    )
  )[0],
  users: (await q('select count(*)::int n from users'))[0].n,
  deletions: (
    await q(
      `select count(*)::int n, coalesce(md5(string_agg(d::text,'|' order by d::text)),'') h from account_deletion_events d`,
    )
  )[0],
  revoked: (await q('select count(*)::int n from revoked_sessions'))[0].n,
});
const before = await snap();

const secret = process.env.LEARNBOX_SESSION_SECRET;
const mk = (subject, ttl = 3600, sid = randomUUID()) => {
  const now = Math.floor(Date.now() / 1000);
  const p = { subject, scope: 'learner', issuedAt: now, expiresAt: now + ttl, sessionId: sid };
  const s = 'v2.' + Buffer.from(JSON.stringify(p)).toString('base64url');
  return { tok: s + '.' + createHmac('sha256', secret).update(s).digest('base64url'), sid };
};
const S = mk(TEST);
const C = (t, extra = {}) => ({ cookie: 'learnbox_alpha_session=' + t, ...extra });
const R = async (path, opt = {}) => {
  const r = await fetch(B + path, { redirect: 'manual', ...opt });
  const buf = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get('content-type') || '';
  let json = null;
  if (ct.includes('json')) {
    try {
      json = JSON.parse(buf.toString());
    } catch {
      json = null; // non-JSON body: leave json null, assertions below check status/headers
    }
  }
  return {
    s: r.status,
    cc: r.headers.get('cache-control') || '',
    ct,
    len: buf.length,
    json,
    age: r.headers.get('age'),
    cf: r.headers.get('cf-cache-status'),
    setc: r.headers.get('set-cookie') || '',
  };
};
const noStore = (r) => /no-store/i.test(r.cc);
const ev = () =>
  JSON.stringify({
    items: [
      {
        clientEventId: randomUUID(),
        contentId: 'start-a1-apfel',
        grade: 'remembered',
        occurredAt: new Date().toISOString(),
      },
    ],
  });
const RH = (t, o) =>
  C(t, { 'content-type': 'application/json', 'x-learnbox-review-owner': TEST, origin: o });

console.log('--- 1 health / DB');
let h = await R('/api/health');
const h2 = await R('/api/health');
ok('health 200', h2.s === 200, 'first=' + h.s + ' second=' + h2.s);
ok(
  'health reports database ok (2nd call)',
  JSON.stringify(h2.json).includes('"ok"') || /database[^,}]*ok/i.test(JSON.stringify(h2.json)),
  JSON.stringify(h2.json).slice(0, 160),
);
ok('landing/app shell 200', (await R('/')).s === 200);

console.log('--- 2 login/session');
let r = await R('/api/auth/session', { headers: C(S.tok) });
ok(
  'valid session 200 authenticated:true for the test user',
  r.s === 200 && noStore(r) && r.json?.authenticated === true && r.json?.userId === TEST,
  's=' + r.s + ' cc=' + r.cc,
);
r = await R('/api/auth/session');
ok(
  'anonymous session -> authenticated:false, never user data',
  r.s === 401 || (r.s === 200 && r.json?.authenticated === false),
  's=' + r.s + ' ' + JSON.stringify(r.json),
);
r = await R('/api/auth/session', { headers: C(S.tok.slice(0, -3) + 'AAA') });
ok(
  'tampered token rejected (authenticated:false, no userId)',
  r.s === 401 ||
    (r.s === 200 && r.json?.authenticated === false && !JSON.stringify(r.json).includes(TEST)),
  's=' + r.s + ' ' + JSON.stringify(r.json),
);
r = await R('/api/auth/session', { headers: C(mk(TEST, -60).tok) });
ok(
  'expired token rejected (authenticated:false, no userId)',
  r.s === 401 ||
    (r.s === 200 && r.json?.authenticated === false && !JSON.stringify(r.json).includes(TEST)),
  's=' + r.s + ' ' + JSON.stringify(r.json),
);
r = await R('/api/auth/otp/request', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
  body: '{"phone":"09000000000"}',
});
ok('OTP request with foreign origin rejected (no SMS sent)', r.s === 403, 's=' + r.s);

console.log('--- 3 profile / progress / summary / state');
for (const p of [
  '/api/learner/profile/details',
  '/api/learner/profile/stats',
  '/api/learner/profile',
  '/api/learner/progress',
  '/api/learner/summary',
  '/api/learner/state',
  '/api/learner/today',
  '/api/learner/words',
  '/api/learner/cards',
]) {
  const a = await R(p, { headers: C(S.tok) });
  const an = await R(p);
  ok(
    'GET ' + p + ' authed 200 + no-store',
    a.s === 200 && noStore(a),
    's=' + a.s + ' cc=' + a.cc.slice(0, 40),
  );
  ok('GET ' + p + ' anonymous -> 401', an.s === 401, 's=' + an.s);
}
r = await R('/api/learner/profile/update', {
  method: 'PATCH',
  headers: C(S.tok, { 'content-type': 'application/json', origin: 'https://evil.example' }),
  body: '{"avatarId":"bobo-1"}',
});
ok('profile update foreign origin -> 403', r.s === 403, 's=' + r.s);
const prof0 = (await q('select first_name, avatar_id from users where id=$1', [TEST]))[0];
r = await R('/api/learner/profile/update', {
  method: 'PATCH',
  headers: C(S.tok, { 'content-type': 'application/json', origin: B }),
  body: JSON.stringify({
    avatarId: prof0.avatar_id ?? null,
    ...(prof0.first_name ? { firstName: prof0.first_name } : {}),
  }),
});
ok(
  'profile update same-origin idempotent write under learnbox_app',
  r.s === 200 || r.s === 204,
  's=' + r.s + ' ' + JSON.stringify(r.json).slice(0, 120),
);
const prof1 = (await q('select first_name, avatar_id from users where id=$1', [TEST]))[0];
ok('profile row unchanged by idempotent write', JSON.stringify(prof0) === JSON.stringify(prof1));

console.log('--- 4 review + replay (writes under learnbox_app)');
const b0 = await snap();
const body = ev();
r = await R('/api/learner/reviews', { method: 'POST', headers: RH(S.tok, B), body });
ok(
  'review #1 accepted',
  r.s === 200 || r.s === 201,
  's=' + r.s + ' ' + JSON.stringify(r.json).slice(0, 140),
);
const b1 = await snap();
ok(
  'review #1 added exactly 1 event',
  b1.test.re - b0.test.re === 1,
  'delta=' + (b1.test.re - b0.test.re),
);
r = await R('/api/learner/reviews', { method: 'POST', headers: RH(S.tok, B), body });
const b2 = await snap();
ok(
  'replay (same clientEventId) is idempotent',
  b2.test.re === b1.test.re,
  's=' + r.s + ' count ' + b1.test.re + '->' + b2.test.re,
);
r = await R('/api/learner/reviews', {
  method: 'POST',
  headers: RH(S.tok, 'https://evil.example'),
  body: ev(),
});
ok('review foreign origin -> 403', r.s === 403, 's=' + r.s);
r = await R('/api/learner/reviews', {
  method: 'POST',
  headers: C(S.tok, { 'content-type': 'application/json', 'x-learnbox-review-owner': TEST }),
  body: ev(),
});
ok('review no origin -> 403', r.s === 403, 's=' + r.s);
r = await R('/api/learner/reviews', {
  method: 'POST',
  headers: C(S.tok, {
    'content-type': 'application/json',
    'x-learnbox-review-owner': OWNER,
    origin: B,
  }),
  body: ev(),
});
ok('review with owner-mismatch header rejected', r.s >= 400 && r.s < 500, 's=' + r.s);
r = await R('/api/learner/reviews', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: B },
  body: ev(),
});
ok('review anonymous -> 401', r.s === 401, 's=' + r.s);
r = await R('/api/learner/reviews', {
  method: 'POST',
  headers: C(S.tok, { 'content-type': 'text/plain', origin: B }),
  body: ev(),
});
ok('review wrong content-type rejected', r.s >= 400 && r.s < 500, 's=' + r.s);
const b3 = await snap();
ok('rejected writes changed nothing', b3.test.re === b2.test.re && b3.test.cs === b2.test.cs);
r = await R('/api/learner/reset-progress', {
  method: 'POST',
  headers: C(S.tok, { origin: B, 'content-type': 'application/json' }),
  body: '{}',
});
ok('reset-progress stays 404', r.s === 404, 's=' + r.s);

console.log('--- 5 account-deletion safeguards (non-destructive paths only)');
const D = (headers, bodyObj) =>
  R('/api/learner/account', { method: 'POST', headers, body: JSON.stringify(bodyObj) });
r = await D(
  { 'content-type': 'application/json', origin: B },
  { confirmPhone: '09000000000', requestId: randomUUID() },
);
ok('deletion anonymous -> 401', r.s === 401, 's=' + r.s);
r = await D(C(S.tok, { 'content-type': 'application/json', origin: 'https://evil.example' }), {
  confirmPhone: '09000000000',
  requestId: randomUUID(),
});
ok('deletion foreign origin -> 403', r.s === 403, 's=' + r.s);
r = await D(C(S.tok, { 'content-type': 'application/json' }), {
  confirmPhone: '09000000000',
  requestId: randomUUID(),
});
ok('deletion no origin -> 403', r.s === 403, 's=' + r.s);
r = await D(C(S.tok, { 'content-type': 'application/json', origin: B }), {
  requestId: randomUUID(),
});
ok('deletion without confirmation -> 400', r.s === 400, 's=' + r.s);
r = await D(C(S.tok, { 'content-type': 'application/json', origin: B }), {
  confirmPhone: '09123456789',
  requestId: randomUUID(),
});
ok(
  'deletion with wrong phone -> 403 (nothing deleted)',
  r.s === 403 || r.s === 401,
  's=' + r.s + ' ' + JSON.stringify(r.json),
);
r = await fetch(B + '/api/learner/account', {
  method: 'GET',
  headers: C(S.tok),
  redirect: 'manual',
});
ok(
  'deletion endpoint is not reachable by GET',
  r.status === 405 || r.status === 404,
  's=' + r.status,
);
const d1 = await snap();
ok(
  'users / deletion-event rows unchanged by safeguard probes',
  d1.users === before.users &&
    d1.deletions.n === before.deletions.n &&
    d1.deletions.h === before.deletions.h,
  `users ${before.users}->${d1.users} events ${before.deletions.n}->${d1.deletions.n}`,
);
const can = async (sql) => {
  try {
    await db.query('begin');
    await db.query(sql);
    await db.query('rollback');
    return 'ALLOWED';
  } catch (e) {
    await db.query('rollback').catch(() => {});
    return 'denied:' + e.code;
  }
};
ok(
  'learnbox_app cannot delete/alter protected deletion ledger',
  (await can('delete from account_deletion_events')).startsWith('denied') &&
    (await can('update account_deletion_events set status=status')).startsWith('denied'),
);
ok(
  'learnbox_app cannot touch admin tables or DDL',
  (await can('select 1 from admin_sessions limit 0')).startsWith('denied') &&
    (await can('create table lb_p0_probe(x int)')).startsWith('denied') &&
    (await can('drop table users')).startsWith('denied') &&
    (await can('truncate users')).startsWith('denied'),
);

console.log('--- 6 protected media');
for (const k of ['image', 'word-audio', 'sentence-audio']) {
  const a = await R('/api/content-media/start-a1-apfel/' + k, { headers: C(S.tok) });
  const an = await R('/api/content-media/start-a1-apfel/' + k);
  ok(
    'media ' + k + ' authed 200, private no-store, no CDN cache',
    a.s === 200 && /private/i.test(a.cc) && noStore(a) && !a.age && !a.cf && a.len > 1000,
    `s=${a.s} len=${a.len} cc=${a.cc}`,
  );
  ok('media ' + k + ' anonymous 401 no-store', an.s === 401 && noStore(an), 's=' + an.s);
}
for (const p of [
  '/api/private-media/start-a1-apfel/image',
  '/api/local-preview-media/start-a1-apfel/image',
  '/content/start-a1-apfel.jpg',
  '/media/start-a1-apfel/image.jpg',
]) {
  const x = await R(p);
  const y = await R(p, { headers: C(S.tok) });
  ok('public/alt media path closed ' + p, x.s === 404 && y.s === 404, `anon=${x.s} authed=${y.s}`);
}

console.log('--- 7 mutation guards (anonymous, guard precedes auth)');
for (const p of [
  '/api/learner/reviews',
  '/api/learner/account',
  '/api/auth/logout',
  '/api/auth/otp/request',
  '/api/auth/otp/verify',
]) {
  const x = await R(p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: '{}',
  });
  ok('POST ' + p + ' foreign origin -> 403', x.s === 403, 's=' + x.s);
}

console.log('--- 8 logout / revocation');
r = await R('/api/auth/logout', {
  method: 'POST',
  headers: C(S.tok, { origin: B, 'content-type': 'application/json' }),
  body: '{}',
});
ok(
  'logout 204 + cookie cleared',
  r.s === 204 && /learnbox_alpha_session=;|Max-Age=0|expires=Thu, 01 Jan 1970/i.test(r.setc),
  's=' + r.s + ' setc=' + r.setc.replace(/=[^;]*/, '=<v>').slice(0, 80),
);
const rv = await q(
  'select user_id::text u, expires_at>now() live from revoked_sessions where session_id=$1',
  [S.sid],
);
ok(
  'revocation row written (learnbox_app INSERT on revoked_sessions)',
  rv.length === 1 && rv[0].u === TEST && rv[0].live === true,
  JSON.stringify(rv),
);
for (const p of [
  '/api/auth/session',
  '/api/learner/today',
  '/api/learner/profile/details',
  '/api/learner/summary',
  '/api/content-media/start-a1-apfel/image',
]) {
  const x = await R(p, { headers: C(S.tok) });
  ok(
    'after logout ' + p + ' -> old token dead',
    x.s === 401 ||
      (p === '/api/auth/session' &&
        x.s === 200 &&
        x.json?.authenticated === false &&
        !JSON.stringify(x.json).includes(TEST)),
    's=' + x.s + (x.json && p === '/api/auth/session' ? ' ' + JSON.stringify(x.json) : ''),
  );
}
r = await R('/api/learner/reviews', { method: 'POST', headers: RH(S.tok, B), body: ev() });
ok('review after logout -> 401, no write', r.s === 401, 's=' + r.s);
// logout-everywhere path (user_session_cutoffs upsert) exercised through a second fresh session, then cleaned via normal expiry
const S2 = mk(TEST);
r = await R('/api/auth/session', { headers: C(S2.tok) });
ok('fresh session after prior logout still valid (no over-revocation)', r.s === 200, 's=' + r.s);
r = await R('/api/auth/logout', {
  method: 'POST',
  headers: C(S2.tok, { origin: B, 'content-type': 'application/json' }),
  body: '{}',
});
ok('second logout 204', r.s === 204, 's=' + r.s);

console.log('--- 9 data integrity');
const after = await snap();
ok(
  'OWNER row/schedules/reviews byte-identical (hash)',
  JSON.stringify(after.owner) === JSON.stringify(before.owner),
  JSON.stringify(before.owner) === JSON.stringify(after.owner) ? '' : 'CHANGED',
);
ok('user count unchanged', after.users === before.users, before.users + '->' + after.users);
ok(
  'account_deletion_events untouched',
  after.deletions.n === before.deletions.n && after.deletions.h === before.deletions.h,
);
ok(
  'test user delta = exactly +1 review event',
  after.test.re - before.test.re === 1,
  'delta=' + (after.test.re - before.test.re),
);
ok(
  'revoked_sessions delta = +2 (two logouts)',
  after.revoked - before.revoked === 2,
  'delta=' + (after.revoked - before.revoked),
);
await db.end();
console.log(`\nRESULT: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
