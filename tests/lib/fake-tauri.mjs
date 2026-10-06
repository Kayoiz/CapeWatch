// What the installed app gives the page, faked for a normal browser: window.__TAURI__ (commands, events,
// start with Windows, the HTTP plugin) and the two GitHub addresses the data comes from. Returns a script
// that runs before the page's own scripts. Everything it sees is kept in window.__test for the tests.
// players: made-up Minecraft players for the Mojang lookups (the HTTP plugin), as [{ id, name, skin, cape }] (skin and
// cape: texture hashes; answerName: a different name in Mojang's answer; hold: Mojang answers about them only once
// the test calls __test.release(); __test.httpDone lists the answered addresses), or 'offline' / 'rate' to fail every lookup
// that way. Tests can change __test.cfg.players later, or put a new list in sessionStorage '__players' for the next load.
// capes.me answers about the same players: seen: the capes it has seen on them (its names for them, here the cape ids
// of the data file, plus 'not-in-data' for a cape the data file does not know; or { type, removed }), none: an account
// it has not seen; seenStatus: an error it answers with; seenHold: it answers only once the test calls
// __test.releaseSeen(). Its list of capes is made from the data file (Minecon 2011 under an older texture, the data
// file's one as the alternative). capesMe: 'offline' (capes.me cannot be reached) or 'nolist' (its list of capes fails);
// sessionStorage '__capesMe' changes it for the next load.
// __test.httpOpts keeps what each request was sent with.
export function fakeTauri({ data = null, mode = 'ok', greeting = 'none', pendingCape = null, blockTextures = true, players = null, capesMe = 'ok' } = {}) {
  const cfg = JSON.stringify({ data, mode, greeting, pendingCape, blockTextures, players, capesMe });
  return `(() => {
  const cfg = ${cfg};
  try { const o = sessionStorage.getItem('__players'); if (o) cfg.players = JSON.parse(o); } catch {}
  try { const c = sessionStorage.getItem('__capesMe'); if (c) cfg.capesMe = c; } catch {}
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
      // "Delete my data" empties the log files; the page starts again right after, so the count is kept for the next load.
      // cfg.holdClear: it finishes only once the test calls __test.releaseClear().
      if (cmd === 'clear_logs') {
        if (test.cfg.holdClear) await new Promise((r) => { test.releaseClear = r; });
        try { sessionStorage.setItem('__clearedLogs', String(+(sessionStorage.getItem('__clearedLogs') || 0) + 1)); } catch {}
        return 2;
      }
      return null;
    } },
    event: { listen: (name, cb) => { (test.listeners[name] ||= []).push(cb); return Promise.resolve(() => {}); } },
    autostart: { isEnabled: async () => test.autostart, enable: async () => { test.autostart = true; }, disable: async () => { test.autostart = false; } },
    http: { fetch: async (url, opts) => {
      const u = String(url), P = test.cfg.players; (test.http ||= []).push(u);
      (test.httpOpts ||= []).push({ url: u, headers: opts?.headers || null });
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
      m = /^https:\\/\\/capes\\.me\\/api\\/(capes|user\\/([0-9a-f]{32}))$/.exec(u);
      if (m) {
        const done = () => setTimeout(() => (test.httpDone ||= []).push(u), 0), TEX = 'https://textures.minecraft.net/texture/';
        if (test.cfg.capesMe === 'offline') { done(); throw new TypeError('Failed to fetch'); }
        if (m[1] === 'capes') {
          done();
          if (test.cfg.capesMe === 'nolist') return new Response('oops', { status: 500 });
          const list = Object.entries(test.cfg.data?.capes || {}).filter(([, c]) => c.textureId).map(([id, c]) => (id === 'minecon-2011'
            ? { type: id, title: c.name, url: TEX + 'd'.repeat(64), alts: [TEX + c.textureId] } : { type: id, title: c.name, url: TEX + c.textureId, alts: [] }));
          list.push({ type: 'not-in-data', title: 'Test', url: TEX + 'e'.repeat(64), alts: [] });
          return json(list);
        }
        const p = P.find((x) => x.id === m[2]);
        if (p?.seenHold) await (test.seenHeld ||= new Promise((r) => { test.releaseSeen = r; }));
        done();
        if (p?.seenStatus) return new Response('', { status: p.seenStatus });
        if (!p?.seen) return json({ error: true, message: 'not_found' }, 404);
        return json({ username: p.name, uuid: p.id, capes: p.seen.map((x) => (typeof x === 'string' ? { type: x, removed: false } : x)) });
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
