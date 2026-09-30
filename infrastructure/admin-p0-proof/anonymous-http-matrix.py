"""Anonymous/forged-credential HTTP matrix against a running Admin container on 127.0.0.1:53000.
Disposable staging only. needles.txt = the 35 Start lemmas (public German words used as leak needles)."""
import json, sys, urllib.request, urllib.error, http.client, re

BASE = ('127.0.0.1', 53000)
ORIGIN = 'https://admin-stage.example.test'
results = []

def req(method, path, headers=None, body=None):
    c = http.client.HTTPConnection(*BASE, timeout=15)
    h = dict(headers or {})
    c.request(method, path, body=body, headers=h)
    r = c.getresponse()
    data = r.read()
    hd = {k.lower(): v for k, v in r.getheaders()}
    c.close()
    return r.status, hd, data.decode('utf8', 'replace')

def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS ' if ok else 'FAIL ') + name + (('  -> ' + detail) if detail else ''))

# ---- 1. anonymous shell / content leak
s, h, b = req('GET', '/')
check('anon GET / returns 200 shell', s == 200, str(s))
NEEDLES = [l.strip() for l in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'needles.txt')) if len(l.strip()) >= 4]
leak_terms = NEEDLES + ['pendingDrafts', 'publishedStartCards']
found = [t for t in leak_terms if t.lower() in b.lower()]
check('anon HTML has no card content (%d real lemmas + draft markers)' % len(leak_terms), not found, str(found[:5]))
# scan every JS chunk the shell references
chunks = sorted(set(re.findall(r'/_next/static/[^"\']+\.js', b)))
leaks = {}
for ch in chunks:
    _, _, js = req('GET', ch)
    hit = [t for t in leak_terms if ('"%s"' % t in js or "'%s'" % t in js or ':"%s"' % t in js)]
    if hit: leaks[ch] = hit
check('anon JS chunks (%d) carry no card content' % len(chunks), not leaks, json.dumps(leaks)[:300])
s, h, b = req('GET', '/api/banners')
check('anon GET /api/banners is not 200 / no data', s != 200 and 'banner_sample' not in b, str(s))

# ---- 2. no-store
for p in ['/', '/api/auth/session', '/api/banners', '/api/content/review']:
    s, h, b = req('GET', p)
    cc = h.get('cache-control', '')
    check('no-store on GET %s (%s)' % (p, s), 'no-store' in cc, cc)

# ---- 3. legacy routes fail closed for EVERY method, incl. with valid origin + json + garbage cookie
legacy = ['/api/banners', '/api/packs', '/api/packs/generate', '/api/packs/import', '/api/gateways',
          '/api/transactions', '/api/users', '/api/users/00000000-0000-4000-8000-000000000000']
for p in legacy:
    for m in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']:
        s, h, b = req(m, p, {'Origin': ORIGIN, 'Content-Type': 'application/json', 'Cookie': '__Host-learnbox_admin=x'},
                      '{}' if m != 'GET' else None)
        ok = s in (404, 405) and 'no-store' in h.get('cache-control', '') or s == 405
        check('legacy %s %s fail-closed' % (m, p), s in (404, 405), 'status=%s cc=%s' % (s, h.get('cache-control')))
s, h, b = req('GET', '/api/packs/csv-template')
check('legacy GET /api/packs/csv-template fail-closed', s in (404, 405), str(s))

# ---- 4. mutation guard matrix on the routes that stay live
live_mut = ['/api/auth/add-passkey/verify', '/api/auth/logout', '/api/content/review/check',
            '/api/content/review/decision', '/api/splash/replace']
cases = [
    ('foreign origin',        {'Origin': 'https://evil.example', 'Content-Type': 'application/json'}, 403),
    ('missing origin',        {'Content-Type': 'application/json'}, 403),
    ('origin null',           {'Origin': 'null', 'Content-Type': 'application/json'}, 403),
    ('origin prefix trick',   {'Origin': ORIGIN + '.evil.com', 'Content-Type': 'application/json'}, 403),
    ('good origin, text/plain', {'Origin': ORIGIN, 'Content-Type': 'text/plain'}, 415),
    ('good origin, form',     {'Origin': ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded'}, 415),
    ('good origin, no CT',    {'Origin': ORIGIN}, 415),
]
GENERIC400 = {'/api/auth/logout', '/api/content/review/check', '/api/content/review/decision', '/api/splash/replace'}
for p in live_mut:
    for name, hdr, want in cases:
        if p in GENERIC400: want = 400
        s, h, b = req('POST', p, hdr, '{}')
        # multipart is allowed for splash upload; only assert the strict JSON-only routes on 415
        strict_json = p != '/api/splash/replace'
        w = want if (strict_json or want == 403) else s
        check('POST %s [%s] -> %s' % (p, name, w), s == w,
              'got %s cc=%s body=%s' % (s, h.get('cache-control'), b[:60]))

# ---- 5. ORDERING: guard before session. A request with a bogus session cookie but foreign origin must be
#         rejected by the guard (403 request_rejected), NOT by the session layer (401).
s, h, b = req('POST', '/api/auth/add-passkey/verify',
              {'Origin': 'https://evil.example', 'Content-Type': 'application/json', 'Cookie': '__Host-learnbox_admin=bogus'}, '{}')
check('ordering: foreign origin + bogus cookie -> 403 request_rejected (guard first)',
      s == 403 and 'request_rejected' in b, 'got %s %s' % (s, b[:80]))
s, h, b = req('POST', '/api/auth/add-passkey/verify',
              {'Origin': ORIGIN, 'Content-Type': 'application/json', 'Cookie': '__Host-learnbox_admin=bogus'}, '{}')
check('ordering: good origin + bogus session -> 401 (session layer reached only after guard)', s == 401, 'got %s' % s)

# logout deliberately answers a generic 400 for BOTH a rejected origin and a missing session (no oracle),
# so HTTP status cannot show its ordering; that ordering is asserted by the source inventory test.
for p in ['/api/content/review/check', '/api/content/review/decision']:
    sa, _, _ = req('POST', p, {'Origin': 'https://evil.example', 'Content-Type': 'application/json', 'Cookie': '__Host-learnbox_admin=bogus'}, '{}')
    sb, _, _ = req('POST', p, {'Origin': ORIGIN, 'Content-Type': 'application/json', 'Cookie': '__Host-learnbox_admin=bogus'}, '{}')
    check('ordering %s: bad origin -> 400 (guard) but good origin/bogus session -> 401 (session)' % p, sa == 400 and sb == 401, 'bad=%s good=%s' % (sa, sb))

# ---- 6. passkey CSRF: with valid origin+CT but NO session there is no way to reach CSRF; assert 401 not 200
s, h, b = req('POST', '/api/auth/add-passkey/verify', {'Origin': ORIGIN, 'Content-Type': 'application/json'}, '{"response":{"id":"x"}}')
check('passkey verify without session -> 401 (never 200)', s == 401, str(s))
s, h, b = req('GET', '/api/auth/add-passkey/options')
check('passkey options anon -> not 200', s != 200, str(s))

# ---- 7. content review server-backed only, anon closed
for m, p in [('GET', '/api/content/review'), ('POST', '/api/content/review/check'), ('POST', '/api/content/review/decision')]:
    s, h, b = req(m, p, {'Origin': ORIGIN, 'Content-Type': 'application/json'}, '{}' if m == 'POST' else None)
    check('anon %s %s not 200, no card data' % (m, p), s != 200 and 'lemma' not in b, 'got %s' % s)

failed = [r for r in results if not r[1]]
print('\nTOTAL %d  PASS %d  FAIL %d' % (len(results), len(results) - len(failed), len(failed)))
sys.exit(1 if failed else 0)
