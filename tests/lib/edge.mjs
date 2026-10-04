// A very small driver for Microsoft Edge (already part of Windows) in headless mode, through the
// DevTools protocol. Lets the tests open the app's page, run code in it, click, resize and take
// screenshots, without installing anything. Edge runs with its own throwaway profile folder.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CANDIDATES = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].filter(Boolean);
export const EDGE = CANDIDATES.find((p) => existsSync(p)) || null;

export const fileUrl = (p) => pathToFileURL(p).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ headless = true } = {}) {
  if (!EDGE) throw new Error('Microsoft Edge not found');
  const profile = mkdtempSync(join(tmpdir(), 'cw-edge-'));
  const args = [
    '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-sync', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    headless ? '--headless=new' : '', 'about:blank'
  ].filter(Boolean);
  const proc = spawn(EDGE, args, { stdio: 'ignore' });
  let port = 0;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    try { port = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {}
  }
  if (!port) { proc.kill(); throw new Error('Edge did not start'); }
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map(), handlers = new Set();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else for (const h of handlers) h(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const n = ++id; pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  async function newPage() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (method, params) => send(method, params, sessionId);
    const console = [], exceptions = [];
    handlers.add((msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.consoleAPICalled') console.push(msg.params.type + ' ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      if (msg.method === 'Log.entryAdded') console.push('log ' + msg.params.entry.level + ' ' + msg.params.entry.text);
    });
    await s('Page.enable'); await s('Runtime.enable'); await s('Network.enable'); await s('Log.enable');
    const waitEvent = (name, ms = 15000) => new Promise((res, rej) => {
      const t = setTimeout(() => { handlers.delete(h); rej(new Error('timeout waiting for ' + name)); }, ms);
      const h = (msg) => { if (msg.sessionId === sessionId && msg.method === name) { clearTimeout(t); handlers.delete(h); res(msg.params); } };
      handlers.add(h);
    });
    const page = {
      console, exceptions,
      send: s,
      // Script that runs before any of the page's own scripts, on every load.
      init: (source) => s('Page.addScriptToEvaluateOnNewDocument', { source }),
      block: (patterns) => s('Network.setBlockedURLs', { urls: patterns }),
      offline: (on) => s('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }),
      async goto(url) { const load = waitEvent('Page.loadEventFired', 30000); await s('Page.navigate', { url }); await load; },
      async reload() { const load = waitEvent('Page.loadEventFired', 30000); await s('Page.reload', {}); await load; },
      async eval(expression) {
        const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
        if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
        return r.result.value;
      },
      async waitFor(expression, ms = 10000) {
        const end = Date.now() + ms;
        for (;;) {
          const v = await page.eval(expression).catch(() => null);
          if (v) return v;
          if (Date.now() > end) throw new Error('timeout: ' + expression);
          await sleep(100);
        }
      },
      viewport: (width, height, scale = 1) => s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false }),
      async screenshot(opts = {}) { const r = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!opts.full, ...(opts.clip ? { clip: { ...opts.clip, scale: 1 } } : {}) }); return Buffer.from(r.data, 'base64'); },
      // A real mouse click at the middle of the element (so :hover/:active and the click handlers all run).
      async click(selector) {
        const box = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        if (!box) throw new Error('no element ' + selector);
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await s('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
      },
      close: () => send('Target.closeTarget', { targetId })
    };
    return page;
  }

  return {
    newPage,
    async close() {
      try { await send('Browser.close'); } catch {}
      ws.close();
      await sleep(300);
      try { proc.kill(); } catch {}
      for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(200); } }
    }
  };
}
