// Runs the app's real shell script (app/shell.js) inside Node, with everything around it faked:
// the Tauri bridge, the browser's storage, the network and the page. Nothing here changes the shell itself.
// Used by the unit tests to check notifications, the first run, settings, updates from older versions
// and what happens when the network or the data file is bad.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const SHELL = new URL('../../app/shell.js', import.meta.url);

// localStorage stand-in. Pass the same one to two shells to simulate "the app was closed and opened
// again" or "the app was updated" (the real app keeps its storage across both).
export function makeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    json: (k) => (m.has('capewatch:' + k) ? JSON.parse(m.get('capewatch:' + k)) : undefined)
  };
}

// A fake answer from fetch().
export function response(body, { status = 200, headers = {} } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return { ok: status >= 200 && status < 300, status, headers: { get: (k) => h.get(k.toLowerCase()) ?? null }, json: async () => JSON.parse(text), text: async () => text };
}

// fetch() that serves the given data file from both GitHub addresses, or fails the way `mode` says.
export function dataServer(state) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    const api = String(url).startsWith('https://api.github.com/');
    const mode = (api ? state.api : state.raw) ?? state.mode ?? 'ok';
    if (mode === 'offline') throw new TypeError('Failed to fetch');
    if (mode === 'ratelimit') return response({ message: 'API rate limit exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
    if (mode === '500') return response('oops', { status: 500 });
    if (mode === 'garbage') return response('<html>not json</html>');
    if (mode === 'raw-body') return response(state.body);
    return response(state.data);
  };
  fn.calls = calls;
  return fn;
}

// Loads one copy of the shell. Returns what it did: notifications, log lines, what the page was given.
export async function loadShell({ storage = makeStorage(), fetch, file = SHELL, source, autostart = false, page = true } = {}) {
  const out = { notifications: [], logs: [], invokes: [], snapshots: { capes: [], events: [], status: [] }, intervals: [], errors: [] };
  const listeners = new Map();
  const target = new EventTarget();
  const tauriListeners = {};
  const autostartState = { on: autostart };
  const ctx = {
    console: {
      info: (...a) => out.logs.push(a.map(String).join(' ')),
      error: (...a) => out.logs.push('ERROR ' + a.map(String).join(' ')),
      warn: (...a) => out.logs.push('WARN ' + a.map(String).join(' ')),
      log: (...a) => out.logs.push(a.map(String).join(' '))
    },
    localStorage: storage,
    fetch,
    setTimeout, clearTimeout,
    setInterval: (fn, ms) => { out.intervals.push({ fn, ms }); return out.intervals.length; },
    clearInterval: () => {},
    performance, atob, btoa, Date, Math, JSON, Promise, Map, Set, URL, Error, TypeError, Object, Array, String, Number, Boolean, RegExp, Symbol,
    Event, CustomEvent,
    addEventListener: (type, fn, opts) => { target.addEventListener(type, fn, opts); (listeners.get(type) || listeners.set(type, []).get(type)).push(fn); },
    removeEventListener: (type, fn) => target.removeEventListener(type, fn),
    dispatchEvent: (e) => target.dispatchEvent(e),
    document: {
      documentElement: { classList: { add() {}, remove() {}, contains: () => false } },
      getElementById: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, append() {}, addEventListener() {} }),
      head: { append() {} }, body: { append() {} }
    },
    __TAURI__: {
      core: {
        invoke: async (cmd, args) => {
          out.invokes.push({ cmd, args });
          if (cmd === 'plugin:log|log') { out.logs.push(args.message); return; }
          if (cmd === 'notify_cape') { out.notifications.push(args); return; }
          if (cmd === 'take_greeting') return 'none';
          if (cmd === 'take_pending_cape') return null;
          return null;
        }
      },
      event: { listen: (name, cb) => { tauriListeners[name] = cb; return Promise.resolve(() => {}); } },
      autostart: { isEnabled: async () => autostartState.on, enable: async () => { autostartState.on = true; }, disable: async () => { autostartState.on = false; } },
      http: { fetch: async () => { throw new Error('no network in tests'); } }
    }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const code = source ?? readFileSync(file, 'utf8');
  try { vm.runInContext(code, ctx, { filename: 'shell.js' }); } catch (e) { out.errors.push(e); }

  // The page subscribes like cape-radar.html does.
  if (page) {
    const db = await ctx.claude.use('db');
    db.collection('capes').limit(1000).onSnapshot((s) => out.snapshots.capes.push(s.docs.map((d) => [d.id, d.data()])));
    db.collection('events').orderBy('at', 'desc').limit(20).onSnapshot((s) => out.snapshots.events.push(s.docs.map((d) => d.data())));
    db.doc('radar/status').onSnapshot((s) => out.snapshots.status.push(s.data()));
  }
  await settle();
  return {
    out, storage, ctx, autostartState,
    // The tray's "Check now" (the same refresh the 30-minute timer runs).
    checkNow: async () => { tauriListeners['check-now']?.(); await settle(); },
    poll: async () => { for (const i of out.intervals.filter((x) => x.ms === 30 * 60 * 1000)) i.fn(); await settle(); },
    fire: async (type) => { target.dispatchEvent(new Event(type)); await settle(); }
  };
}

// Lets the shell's promises and zero-delay timers finish.
export async function settle(rounds = 6) {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 5));
}

// Small data files for the tests: made-up capes, text only.
export function sampleData({ events = {}, capes = {}, at = '2026-10-01T06:00:00Z' } = {}) {
  return {
    schema: 1,
    status: { lastCheckAt: at, lastResult: '0 new, 0 changed', capeCount: 2 + Object.keys(capes).length },
    capes: {
      'test-alpha': { name: 'Test Alpha Cape', editions: ['java', 'bedrock'], availability: 'ended', category: 'other', releaseDate: '2024-01-01', obtainEn: 'Made up for the tests.' },
      'test-beta': { name: 'Test Beta Cape', editions: ['java'], availability: 'available', availableUntil: '2026-12-31', category: 'event-virtual', cost: 'free', releaseDate: '2026-09-01', obtainEn: 'Made up for the tests.' },
      ...capes
    },
    events: {
      '20260930-baseline': { at: '2026-09-30T12:00:00Z', type: 'baseline', textEn: 'CapeWatch started.' },
      ...events
    }
  };
}

export const ev = (id, type, at = '2026-10-02T06:00:00Z') => ({ at, type, capeId: id, capeName: id + ' Cape', textEn: id + ': ' + type, textHe: id + ': ' + type + ' (he)' });
