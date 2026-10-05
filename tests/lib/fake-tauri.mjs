// What the installed app gives the page, faked for a normal browser: window.__TAURI__ (commands, events,
// start with Windows, the HTTP plugin) and the two GitHub addresses the data comes from. Returns a script
// that runs before the page's own scripts. Everything it sees is kept in window.__test for the tests.
// players: made-up Minecraft players for the Mojang lookups (the HTTP plugin), as [{ id, name, skin, cape }] (skin and
// cape: texture hashes; answerName: a different name in Mojang's answer; hold: Mojang answers about them only once
// the test calls __test.release(); __test.httpDone lists the answered addresses), or 'offline' / 'rate' to fail every lookup
// that way. Tests can change __test.cfg.players later, or put a new list in sessionStorage '__players' for the next load.
export function fakeTauri({ data = null, mode = 'ok', greeting = 'none', pendingCape = null, blockTextures = true, players = null } = {}) {
  const cfg = JSON.stringify({ data, mode, greeting, pendingCape, blockTextures, players });
  return `(() => {
  const cfg = ${cfg};
  try { const o = sessionStorage.getItem('__players'); if (o) cfg.players = JSON.parse(o); } catch {}
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
    http: { fetch: async (url) => {
      const u = String(url), P = test.cfg.players; (test.http ||= []).push(u);
      if (!P) throw new Error('no network in tests');
      if (P === 'offline') throw new TypeError('Failed to fetch');
      if (P === 'rate') return new Response('', { status: 429 });
      const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      let m = /^https:\\/\\/api\\.mojang\\.com\\/users\\/profiles\\/minecraft\\/(.+)$/.exec(u);
      if (m) {
        const name = decodeURIComponent(m[1]), p = P.find((x) => x.name.toLowerCase() === name.toLowerCase());
        return p ? json({ id: p.id, name: p.answerName ?? p.name }) : json({ path: '/users/profiles/minecraft/' + name, errorMessage: "Couldn't find any profile with name " + name }, 404);
      }
      m = /^https:\\/\\/sessionserver\\.mojang\\.com\\/session\\/minecraft\\/profile\\/([0-9a-f]{32})$/.exec(u);
      if (m) {
        const p = P.find((x) => x.id === m[1]);
        if (p?.hold) await (test.held ||= new Promise((r) => { test.release = r; }));
        setTimeout(() => (test.httpDone ||= []).push(u), 0);
        if (!p) return new Response(null, { status: 204 });
        const textures = { SKIN: { url: 'http://textures.minecraft.net/texture/' + (p.skin || '0') } };
        if (p.cape) textures.CAPE = { url: 'http://textures.minecraft.net/texture/' + p.cape };
        return json({ id: p.id, name: p.answerName ?? p.name, properties: [{ name: 'textures', value: btoa(JSON.stringify({ timestamp: 1, profileId: p.id, profileName: p.answerName ?? p.name, textures })) }] });
      }
      throw new Error('unexpected address in a test: ' + u);
    } }
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
