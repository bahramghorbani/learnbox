#!/usr/bin/env node
// LearnBox local dashboard server. Localhost-only (127.0.0.1), no dependencies.
//   node server.mjs [--port 4173]
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAll } from './collect.mjs';
import { buildModel } from './compute.mjs';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), 'public');

function parsePort(argv, env) {
  const arg = argv.indexOf('--port');
  if (arg !== -1 && argv[arg + 1]) return Number(argv[arg + 1]);
  if (env.PORT) return Number(env.PORT);
  return 4173;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
};

function isLoopback(req) {
  const addr = req.socket.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function send(res, code, body, contentType) {
  res.writeHead(code, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  if (!isLoopback(req)) {
    send(res, 403, 'Forbidden — loopback only.\n', 'text/plain; charset=utf-8');
    return;
  }
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api') {
    try {
      const raw = await collectAll();
      send(res, 200, JSON.stringify(buildModel(raw)), 'application/json; charset=utf-8');
    } catch (err) {
      send(
        res,
        500,
        JSON.stringify({ error: String((err && err.stack) || err) }),
        'application/json; charset=utf-8',
      );
    }
    return;
  }
  if (url.pathname === '/') {
    try {
      send(res, 200, readFileSync(join(PUBLIC_DIR, 'index.html')), MIME['.html']);
    } catch {
      send(res, 404, 'index.html missing\n', 'text/plain; charset=utf-8');
    }
    return;
  }
  send(res, 404, 'Not found\n', 'text/plain; charset=utf-8');
});

const PORT = parsePort(process.argv.slice(2), process.env);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`LearnBox dashboard: http://127.0.0.1:${PORT}  (Ctrl-C to stop)`);
});
