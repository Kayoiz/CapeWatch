// Serves the built page (app/dist) on 127.0.0.1 with the app's own security policy (CSP), the way the
// installed app gets it: the policy from app/src-tauri/tauri.conf.json, plus the hash of each inline script,
// which Tauri adds when it builds the app. Only for the tests; it listens on a random local port.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../../app/dist/', import.meta.url));
const CONF = JSON.parse(readFileSync(new URL('../../app/src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.css': 'text/css' };

// The policy text the app sends with its page.
export function appCsp(html) {
  const csp = { ...CONF.app.security.csp };
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, body]) =>
    "'sha256-" + createHash('sha256').update(body.replace(/\r\n?/g, '\n')).digest('base64') + "'");
  csp['script-src'] += ' ' + hashes.join(' ');
  return Object.entries(csp).map(([k, v]) => k + ' ' + v).join('; ');
}

export async function serveApp() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '') || 'index.html';
    const file = join(DIST, path);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    const body = readFileSync(file);
    const headers = { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' };
    if (file.endsWith('.html')) headers['Content-Security-Policy'] = appCsp(body.toString('utf8'));
    res.writeHead(200, headers); res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  return { url, close: () => new Promise((r) => server.close(r)) };
}
