"""Authenticated HTTP matrix. Seeds a SYNTHETIC owner+session in a DISPOSABLE Postgres (docker container lb-p0-tls-pg) and cleans up. Never point at Production."""
import base64, hashlib, hmac, http.client, json, os, subprocess, sys, uuid

KEY = 'throwaway-token-hash-key-0123456789abcdef0123456789abcdef'
ORIGIN = 'https://admin-stage.example.test'
BASE = ('127.0.0.1', 53000)
COOKIE = '__Host-learnbox_admin_session'
results = []

def h(secret):
    return base64.urlsafe_b64encode(hmac.new(KEY.encode(), secret.encode(), hashlib.sha256).digest()).decode().rstrip('=')

def sql(q, db='neondb', user='neondb_owner'):
    r = subprocess.run(['docker', 'exec', '-i', 'lb-p0-tls-pg', 'psql', '-U', user, '-d', db, '-Atq', '-v', 'ON_ERROR_STOP=1'],
                       input=q, capture_output=True, text=True)
    if r.returncode: raise SystemExit('SQL failed: ' + r.stderr[:300])
    return r.stdout.strip()

def req(method, path, headers=None, body=None):
    c = http.client.HTTPConnection(*BASE, timeout=15)
    c.request(method, path, body=body, headers=headers or {})
    r = c.getresponse(); data = r.read().decode('utf8', 'replace')
    hd = {k.lower(): v for k, v in r.getheaders()}; c.close()
    return r.status, hd, data

def check(name, ok, detail=''):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + ((' -> ' + detail) if detail else ''))

# ---- seed a SYNTHETIC owner + reviewer + session directly as the DB owner (disposable DB only)
uid = str(uuid.uuid4())
sql("DELETE FROM admin_sessions; DELETE FROM admin_passkey_credentials; DELETE FROM admin_owner;")
sql(f"INSERT INTO users (id, phone_e164) VALUES ('{uid}', '+98900{uuid.uuid4().int % 10**7:07d}');")
sql(f"INSERT INTO admin_owner (singleton_id, webauthn_user_handle, user_id) VALUES (1, decode('{os.urandom(16).hex()}','hex'), '{uid}');")
sql(f"INSERT INTO admin_role_assignments (user_id, role) VALUES ('{uid}', 'content_reviewer') ON CONFLICT DO NOTHING;")

def new_session(recent=True):
    tok, csrf = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('='), base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('=')
    sql(f"INSERT INTO admin_sessions (token_hash, owner_singleton_id, csrf_hash, created_at, last_seen_at, absolute_expires_at, recent_authenticated_at) "
        f"VALUES ('{h(tok)}', 1, '{h(csrf)}', now() - interval '{0 if recent else 4} hours', now(), now() + interval '8 hours', now() - interval '{0 if recent else 3} hours');")
    return tok, csrf

def hdr(tok, csrf=None, origin=ORIGIN, ct='application/json', extra=None):
    d = {'Cookie': f'{COOKIE}={tok}'}
    if origin: d['Origin'] = origin
    if ct: d['Content-Type'] = ct
    if csrf: d['x-learnbox-csrf-token'] = csrf
    d.update(extra or {})
    return d

tok, csrf = new_session()
mutations_before = sql("SELECT (SELECT count(*) FROM content_review_decisions), (SELECT count(*) FROM audit_logs), (SELECT count(*) FROM review_events), (SELECT count(*) FROM card_schedules), (SELECT count(*) FROM users)")

# ---- authenticated reads
s, hd, b = req('GET', '/api/auth/session', hdr(tok, ct=None, origin=None))
check('valid session: GET /api/auth/session 200', s == 200, f'{s} {b[:80]}')
s, hd, b = req('GET', '/api/content/review', hdr(tok, ct=None, origin=None))
check('valid session: GET /api/content/review 200 (server-backed queue)', s == 200, f'{s} {b[:60]}')
try:
    q = json.loads(b); n = len(q.get('items', q.get('queue', [])))
    check('review queue served from DB (35 needs_review candidates)', n == 35, f'items={n}')
except Exception as e:
    check('review queue parses', False, str(e))
check('review response no-store', 'no-store' in hd.get('cache-control', ''), hd.get('cache-control', ''))

# ---- legacy routes STILL closed for an authenticated owner, every method
for p in ['/api/users', '/api/users/' + uid, '/api/banners', '/api/packs', '/api/gateways', '/api/transactions']:
    for m in ['GET', 'POST', 'PATCH', 'DELETE']:
        s, hd, b = req(m, p, hdr(tok, csrf), '{"action":"reset_progress"}' if m != 'GET' else None)
        check(f'authenticated owner: legacy {m} {p.replace(uid, "<id>")} closed (404/405, never 2xx)', s in (404, 405), str(s))
check('reset_progress erased nothing (users still present)', sql(f"SELECT count(*) FROM users WHERE id='{uid}'") == '1')

# ---- CSRF matrix on a live mutation (review check), valid session + valid origin/CT
CVID = sql("SELECT id FROM card_versions WHERE status='needs_review' ORDER BY id LIMIT 1")
checks_before = sql('SELECT count(*) FROM content_review_checks')
body = json.dumps({'cardVersionId': CVID, 'dimension': 'provenance', 'outcome': 'passed', 'notes': 'p0 staging proof'})
for name, kw, want in [
    ('no CSRF header', dict(csrf=None), 400),
    ('wrong CSRF header', dict(csrf='x' * 43), 400),
    ('another session\'s CSRF', dict(csrf=new_session()[1]), 400),
    ('valid CSRF, foreign origin', dict(csrf=csrf, origin='https://evil.example'), 400),
    ('valid CSRF, text/plain', dict(csrf=csrf, ct='text/plain'), 400),
]:
    s, hd, b = req('POST', '/api/content/review/check', hdr(tok, **kw), body)
    check(f'review check [{name}] rejected', s == want, f'{s} {b[:50]}')
# valid CSRF passes the guard: it must get PAST the guard layers (400 for missing idempotency key is body validation, not CSRF)
IK = str(uuid.uuid4())
s, hd, b = req('POST', '/api/content/review/check', hdr(tok, csrf, extra={'Idempotency-Key': IK}), body)
check('review check [valid CSRF + origin + CT + idempotency key] -> 200 applied', s == 200, f'{s} {b[:100]}')
check('...and the pending check row was updated to passed by learnbox_admin', sql(f"SELECT count(*) FROM content_review_checks WHERE reviewer_user_id='{uid}' AND outcome='passed' AND card_version_id='{CVID}' AND dimension='provenance'") == '1' and sql('SELECT count(*) FROM content_review_checks') == checks_before)
s2, _, b2 = req('POST', '/api/content/review/check', hdr(tok, csrf, extra={'Idempotency-Key': IK}), body)
check('replay with same idempotency key is idempotent (still exactly one reviewed row)', s2 == 200 and sql(f"SELECT count(*) FROM content_review_checks WHERE reviewer_user_id='{uid}'") == '1', f'{s2} {b2[:80]}')

# ---- stale re-authentication is required for a decision
stok, scsrf = new_session(recent=False)
s, hd, b = req('POST', '/api/content/review/decision', hdr(stok, scsrf, extra={'Idempotency-Key': str(uuid.uuid4())}), '{}')
check('non-recent session: decision requires re-authentication (428)', s == 428, f'{s} {b[:60]}')

# ---- add-passkey/verify with a valid session but no CSRF
s, hd, b = req('POST', '/api/auth/add-passkey/verify', hdr(tok, csrf=None), '{"response":{"id":"x"}}')
check('add-passkey/verify valid session, NO csrf -> rejected', s in (400, 403), str(s))
s, hd, b = req('POST', '/api/auth/add-passkey/verify', hdr(tok, csrf='y' * 43), '{"response":{"id":"x"}}')
check('add-passkey/verify valid session, wrong csrf -> rejected', s in (400, 403), str(s))

# ---- logout: needs CSRF; then the session is revoked for real
s, hd, b = req('POST', '/api/auth/logout', hdr(tok, csrf=None), '{}')
check('logout without CSRF rejected, session NOT revoked', s == 400 and sql(f"SELECT revoked_at IS NULL FROM admin_sessions WHERE token_hash='{h(tok)}'") == 't', str(s))
s, hd, b = req('POST', '/api/auth/logout', hdr(tok, csrf), '{}')
check('logout with CSRF -> 204', s == 204, str(s))
check('logout cleared the session cookie', any(('Max-Age=0' in v) for k, v in hd.items() if k == 'set-cookie'), hd.get('set-cookie', '')[:80])
check('session row revoked in DB', sql(f"SELECT revoked_at IS NOT NULL FROM admin_sessions WHERE token_hash='{h(tok)}'") == 't')
s, hd, b = req('GET', '/api/content/review', hdr(tok, ct=None, origin=None))
check('revoked session can no longer read the queue (401)', s == 401, str(s))
s, hd, b = req('POST', '/api/auth/logout', hdr(tok, csrf), '{}')
check('replayed logout with revoked session rejected', s == 400, str(s))

# ---- expiry: idle > 15 min and absolute
otok, ocsrf = new_session()
sql(f"UPDATE admin_sessions SET created_at = now() - interval '20 minutes', recent_authenticated_at = now() - interval '20 minutes', last_seen_at = now() - interval '16 minutes' WHERE token_hash='{h(otok)}'")
s, hd, b = req('GET', '/api/content/review', hdr(otok, ct=None, origin=None))
check('idle-expired session (16 min) rejected', s == 401, str(s))

# ---- no unexpected data mutation
mutations_after = sql("SELECT (SELECT count(*) FROM content_review_decisions), (SELECT count(*) FROM audit_logs), (SELECT count(*) FROM review_events), (SELECT count(*) FROM card_schedules), (SELECT count(*) FROM users)")
check('no decisions / review_events / schedules / users changed by the whole run (audit_logs may gain rows)', mutations_before.split('|')[0:1] == mutations_after.split('|')[0:1] and mutations_before.split('|')[2:] == mutations_after.split('|')[2:], f'{mutations_before} -> {mutations_after}')

# cleanup synthetic fixtures
sql(f"DELETE FROM admin_sessions; DELETE FROM audit_logs WHERE actor_user_id='{uid}'; UPDATE content_review_checks SET outcome='pending', reviewer_user_id=NULL, reviewed_at=NULL, notes=NULL, idempotency_key=NULL WHERE reviewer_user_id='{uid}'; DELETE FROM admin_role_assignments WHERE user_id='{uid}'; DELETE FROM admin_owner WHERE user_id='{uid}'; DELETE FROM users WHERE id='{uid}';")
print(f'\nTOTAL {len(results)} PASS {sum(results)} FAIL {len(results) - sum(results)}')
sys.exit(0 if all(results) else 1)
