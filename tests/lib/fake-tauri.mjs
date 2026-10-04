// What the installed app gives the page, faked for a normal browser: window.__TAURI__ (commands, events,
// start with Windows, the HTTP plugin) and the two GitHub addresses the data comes from. Returns a script
// that runs before the page's own scripts. Everything it sees is kept in window.__test for the tests.
export function fakeTauri({ data = null, mode = 'ok', greeting = 'none', pendingCape = null, blockTextures = true } = {}) {
  const cfg = JSON.stringify({ data, mode, greeting, pendingCape, blockTextures });
  return `(() => {
  const cfg = ${cfg};
  const test = window.__test = { cfg, notifications: [], logs: [], invokes: [], listeners: {}, autostart: false, fetches: [] };
  test.emit = (name, payload) => { for (const cb of test.listeners[name] || []) cb({ payload }); };
  window.__TAURI__ = {
    core: { invoke: async (cmd, args) => {
      test.invokes.push(cmd);
      if (cmd === 'plugin:log|log') { test.logs.push(args.message); return; }
      if (cmd === 'notify_cape') { test.notifications.push(args); return; }
      if (cmd === 'take_greeting') return cfg.greeting;
      if (cmd === 'take_pending_cape') { const p = cfg.pendingCape; cfg.pendingCape = null; return p; }
      if (cmd === 'plugin:opener|open_url') { test.opened = args.url; return; }
      return null;
    } },
    event: { listen: (name, cb) => { (test.listeners[name] ||= []).push(cb); return Promise.resolve(() => {}); } },
    autostart: { isEnabled: async () => test.autostart, enable: async () => { test.autostart = true; }, disable: async () => { test.autostart = false; } },
    http: { fetch: async () => { throw new Error('no network in tests'); } }
  };
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    const u = String(url); test.fetches.push(u);
    if (u.startsWith('https://api.github.com/') || u.startsWith('https://raw.githubusercontent.com/Kayoiz/CapeWatch/main/data/')) {
      const m = test.cfg.mode;
      if (m === 'offline') throw new TypeError('Failed to fetch');
      if (m === 'ratelimit' && u.startsWith('https://api.github.com/')) return new Response('{"message":"API rate limit exceeded"}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
      if (m === 'garbage') return new Response('<html>not json</html>', { status: 200 });
      if (typeof m === 'object' && m && 'body' in m) return new Response(m.body, { status: 200 });
      return new Response(JSON.stringify(test.cfg.data), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return realFetch(url, opts);
  };
})();`;
}
