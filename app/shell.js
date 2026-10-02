// CapeWatch Windows app shell. Loaded before the page script (see build-web.mjs).
// - Data: pulls data/capewatch.json from the public repo on start and every 30 minutes, keeps the last copy
//   for offline use, and feeds it to the page through the same small db interface the page already uses.
// - Pictures: draws every card picture (cape and elytra) from the Minecraft texture at runtime. No game or
//   wiki image is stored anywhere in the app or the repo.
// - Notifications: Windows notifications for new events, filtered by the three settings checkboxes.
// - Settings: notifications, start with Windows, and the figure's skin by Minecraft username.
window.__CAPEWATCH_APP__ = true;
(() => {
  const DATA_URL = 'https://raw.githubusercontent.com/Kayoiz/CapeWatch/main/data/capewatch.json';
  const POLL_MS = 30 * 60 * 1000;
  const T = window.__TAURI__ || null;
  const invoke = (cmd, args) => T?.core?.invoke(cmd, args);
  // Everything the shell does goes to the app log file as well as the console.
  const LEVEL = { info: 3, warn: 4, error: 5 };
  function log(level, ...parts) {
    const msg = '[App] ' + parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
    (level === 'error' ? console.error : console.info)(msg);
    try { invoke('plugin:log|log', { level: LEVEL[level], message: msg })?.catch(() => {}); } catch {}
  }
  addEventListener('error', (e) => log('error', 'page error:', e.message, e.filename + ':' + e.lineno));
  // Mirror the page's own [Cape3D]/[Title]/[Cards] console lines into the log file too.
  for (const k of ['info', 'error']) {
    const orig = console[k].bind(console);
    console[k] = (...a) => { orig(...a); if (typeof a[0] === 'string' && /^\[(Cape3D|Title|Cards)\]/.test(a[0])) { try { invoke('plugin:log|log', { level: LEVEL[k], message: a.map(String).join(' ') })?.catch(() => {}); } catch {} } };
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem('capewatch:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('capewatch:' + k, JSON.stringify(v)); } catch {} }
  };

  // ---------- data ----------
  let data = store.get('data', null);
  const subs = { capes: [], events: [], status: [] };
  const docs = (obj) => ({ docs: Object.entries(obj || {}).map(([id, d]) => ({ id, exists: true, data: () => d })) });
  function emit() {
    if (!data) return;
    for (const cb of subs.capes) cb(docs(data.capes));
    const ev = docs(data.events); ev.docs.sort((a, b) => String(b.data().at).localeCompare(String(a.data().at)));
    for (const cb of subs.events) cb(ev);
    for (const cb of subs.status) cb({ exists: true, data: () => data.status });
  }
  const collection = (name) => ({
    limit() { return this; }, orderBy() { return this; },
    onSnapshot(cb) {
      if (name in subs) { subs[name].push(cb); if (data) setTimeout(emit, 0); }
      else setTimeout(() => cb({ docs: [] }), 0);   // capeImages / elytraImages: the app draws its own
      return () => {};
    }
  });
  const db = { collection, doc: () => ({ onSnapshot(cb) { subs.status.push(cb); if (data) setTimeout(emit, 0); return () => {}; } }) };
  window.claude = { use: async (name) => (name === 'db' ? db : null) };

  async function refresh(reason) {
    try {
      const r = await fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const next = await r.json();
      if (!next || !next.capes) throw new Error('bad data file');
      data = next; store.set('data', next);
      log('info', 'data: loaded (' + reason + '),', Object.keys(next.capes).length + ' capes, robot checked ' + (next.status?.lastCheckAt || '?'));
      emit();
      notify(next);
    } catch (e) {
      log('warn', 'data: fetch failed (' + reason + '): ' + (e.message || e) + (data ? ' - showing the saved copy' : ''));
      if (data) emit();
    }
  }

  // ---------- texts the shell shows (7 languages) ----------
  const UI = {
    en: { settings: 'Settings', notif: 'Notifications', nNew: 'New cape', nOpen: 'Promotion opened', nEnding: 'Promotion ending soon', autostart: 'Start CapeWatch with Windows', skin: 'My skin (Minecraft username)', skinHint: 'Empty = the default skin.', save: 'Save', close: 'Close', skinOk: 'Skin loaded.', skinBad: 'Username not found.', EV: { new: 'New cape', announced: 'Announced', available: 'Promotion opened', ending: 'Ending soon' } },
    he: { settings: 'הגדרות', notif: 'התראות', nNew: 'גלימה חדשה', nOpen: 'מבצע שנפתח', nEnding: 'מבצע שעומד להיגמר', autostart: 'להפעיל את CapeWatch עם Windows', skin: 'הסקין שלי (שם משתמש ב-Minecraft)', skinHint: 'ריק = הסקין המקורי.', save: 'שמירה', close: 'סגירה', skinOk: 'הסקין נטען.', skinBad: 'שם המשתמש לא נמצא.', EV: { new: 'גלימה חדשה', announced: 'הוכרזה', available: 'המבצע נפתח', ending: 'עומד להיגמר' } },
    es: { settings: 'Ajustes', notif: 'Notificaciones', nNew: 'Capa nueva', nOpen: 'Promoción abierta', nEnding: 'Promoción por terminar', autostart: 'Iniciar CapeWatch con Windows', skin: 'Mi skin (usuario de Minecraft)', skinHint: 'Vacío = la skin por defecto.', save: 'Guardar', close: 'Cerrar', skinOk: 'Skin cargada.', skinBad: 'No se encontró el usuario.', EV: { new: 'Capa nueva', announced: 'Anunciada', available: 'Promoción abierta', ending: 'Termina pronto' } },
    pt: { settings: 'Configurações', notif: 'Notificações', nNew: 'Capa nova', nOpen: 'Promoção aberta', nEnding: 'Promoção acabando', autostart: 'Iniciar o CapeWatch com o Windows', skin: 'Minha skin (usuário do Minecraft)', skinHint: 'Vazio = a skin padrão.', save: 'Salvar', close: 'Fechar', skinOk: 'Skin carregada.', skinBad: 'Usuário não encontrado.', EV: { new: 'Capa nova', announced: 'Anunciada', available: 'Promoção aberta', ending: 'Acaba em breve' } },
    fr: { settings: 'Réglages', notif: 'Notifications', nNew: 'Nouvelle cape', nOpen: 'Promotion ouverte', nEnding: 'Promotion bientôt finie', autostart: 'Lancer CapeWatch avec Windows', skin: 'Mon skin (pseudo Minecraft)', skinHint: 'Vide = le skin par défaut.', save: 'Enregistrer', close: 'Fermer', skinOk: 'Skin chargé.', skinBad: 'Pseudo introuvable.', EV: { new: 'Nouvelle cape', announced: 'Annoncée', available: 'Promotion ouverte', ending: 'Bientôt terminée' } },
    de: { settings: 'Einstellungen', notif: 'Benachrichtigungen', nNew: 'Neuer Umhang', nOpen: 'Aktion gestartet', nEnding: 'Aktion endet bald', autostart: 'CapeWatch mit Windows starten', skin: 'Mein Skin (Minecraft-Name)', skinHint: 'Leer = der Standard-Skin.', save: 'Speichern', close: 'Schließen', skinOk: 'Skin geladen.', skinBad: 'Name nicht gefunden.', EV: { new: 'Neuer Umhang', announced: 'Angekündigt', available: 'Aktion gestartet', ending: 'Endet bald' } },
    ru: { settings: 'Настройки', notif: 'Уведомления', nNew: 'Новый плащ', nOpen: 'Акция открыта', nEnding: 'Акция скоро закончится', autostart: 'Запускать CapeWatch с Windows', skin: 'Мой скин (ник в Minecraft)', skinHint: 'Пусто = скин по умолчанию.', save: 'Сохранить', close: 'Закрыть', skinOk: 'Скин загружен.', skinBad: 'Ник не найден.', EV: { new: 'Новый плащ', announced: 'Анонс', available: 'Акция открыта', ending: 'Скоро закончится' } }
  };
  const lang = () => (window.CapeWatchPage?.lang?.() || store.get('lang', 'en'));
  const ui = () => UI[lang()] || UI.en;

  // ---------- notifications ----------
  const settings = Object.assign({ notifyNew: true, notifyOpen: false, notifyEnding: false, skinName: '' }, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);
  const SETTING_FOR = { new: 'notifyNew', announced: 'notifyNew', available: 'notifyOpen', ending: 'notifyEnding' };
  function notify(d) {
    const ids = Object.keys(d.events || {});
    const seenBefore = store.get('seen', null);
    store.set('seen', ids);
    if (!seenBefore) { log('info', 'notify: first run, ' + ids.length + ' existing events marked as seen'); return; }
    const seen = new Set(seenBefore);
    for (const id of ids.filter((x) => !seen.has(x))) {
      const e = d.events[id], key = SETTING_FOR[e.type];
      if (!key) { log('info', 'notify: ' + id + ' (' + e.type + ') has no notification type'); continue; }
      if (!settings[key]) { log('info', 'notify: ' + id + ' skipped, "' + key + '" is off'); continue; }
      send(e);
    }
  }
  async function send(e) {
    const L = ui(), cap = lang().charAt(0).toUpperCase() + lang().slice(1);
    const title = 'CapeWatch: ' + (L.EV[e.type] || e.type);
    const body = e['text' + cap] || e.textEn || e.capeName || '';
    try {
      // The app's own command: clicking this notification opens the window on the cape (see main.rs).
      await invoke('notify_cape', { title, body, capeId: e.capeId || '' });
      store.set('lastNotified', { id: e.capeId, at: Date.now() });
      log('info', 'notify: sent', e.type, e.capeId);
    } catch (err) { log('error', 'notify: failed', e.capeId, err.message || err); }
  }

  // ---------- skin by Minecraft username (through the app's HTTP plugin: these APIs have no CORS) ----------
  async function skinUrlFor(name) {
    const http = T?.http?.fetch;
    if (!http) throw new Error('http API missing');
    const p = await http('https://api.mojang.com/users/profiles/minecraft/' + encodeURIComponent(name));
    if (!p.ok) throw new Error('profile ' + p.status);
    const { id } = await p.json();
    const s = await http('https://sessionserver.mojang.com/session/minecraft/profile/' + id);
    if (!s.ok) throw new Error('session ' + s.status);
    const prop = (await s.json()).properties?.find((x) => x.name === 'textures');
    const url = JSON.parse(atob(prop.value)).textures?.SKIN?.url;
    if (!url) throw new Error('no skin');
    return url.replace(/^http:/, 'https:');
  }
  async function applySkin(name) {
    const page = window.CapeWatchPage;
    if (!page) return false;
    if (!name) { await page.cape3d.setSkin(null); log('info', 'skin: default'); return true; }
    try { const url = await skinUrlFor(name); const ok = await page.cape3d.setSkin(url); log('info', 'skin: ' + name + (ok ? ' loaded' : ' failed')); return ok; }
    catch (e) { log('warn', 'skin: ' + name + ' not loaded: ' + (e.message || e)); return false; }
  }

  // ---------- card pictures drawn from the textures ----------
  // One small offscreen viewer: a grey figure seen from behind and above (the angle and light measured
  // against the wiki renders), wearing the cape, then the elytra. Pictures stay in memory only.
  const PICS = new Map();          // 'id|cape' / 'id|elytra' -> data URL or null
  const queue = []; let busy = false, gen = null;
  window.capeArt = {
    get(id, kind, url) {
      const k = id + '|' + kind;
      if (PICS.has(k)) return PICS.get(k);
      if (!url) return null;
      if (!queue.some((j) => j.id === id) && !PICS.has(id + '|cape')) { queue.push({ id, url }); pump(); }
      return null;
    }
  };
  async function makeGen() {
    const W = 240, H = 300, sv = window.skinview3d;
    const v = new sv.SkinViewer({ canvas: document.createElement('canvas'), width: W, height: H, enableControls: false, renderPaused: true, pixelRatio: 1, fov: 6 });
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const R = new v.renderer.constructor({ canvas: out, alpha: true, antialias: true, preserveDrawingBuffer: true });
    R.setPixelRatio(1); R.setSize(W, H, false); R.setClearColor(0x000000, 0); v.background = null;
    // grey "statue" skin like the wiki renders: flat grey faces with a lighter frame
    const sk = document.createElement('canvas'); sk.width = 64; sk.height = 64; const g = sk.getContext('2d');
    const face = (x, y, w, h) => { g.fillStyle = 'rgb(168,168,168)'; g.fillRect(x, y, w, h); g.fillStyle = 'rgb(150,150,150)'; if (w > 2 && h > 2) g.fillRect(x + 1, y + 1, w - 2, h - 2); };
    const box = (u, t, w, h, d) => { face(u + d, t, w, d); face(u + d + w, t, w, d); face(u, t + d, d, h); face(u + d, t + d, w, h); face(u + d + w, t + d, d, h); face(u + 2 * d + w, t + d, w, h); };
    box(0, 0, 8, 8, 8); box(16, 16, 8, 12, 4); box(40, 16, 4, 12, 4); box(0, 16, 4, 12, 4); box(32, 48, 4, 12, 4); box(16, 48, 4, 12, 4);
    await v.loadSkin(sk, { model: 'default' });
    const sm = v.playerObject.skin.map; if (sm) { sm.colorSpace = 'srgb'; sm.needsUpdate = true; }
    v.globalLight.intensity = 0.7; v.cameraLight.intensity = 0;
    const sun = new v.cameraLight.constructor(0xffffff, 2.6, 0, 0);
    const az = 105 * Math.PI / 180, el = 45 * Math.PI / 180;
    sun.position.set(1000 * Math.cos(el) * Math.sin(az), 1000 * Math.sin(el), 1000 * Math.cos(el) * Math.cos(az)); v.scene.add(sun);
    const ely = v.playerObject.elytra;
    ely.rightWing.position.z = 0.2;   // one wing a little behind the other: no flicker where they overlap
    ely.leftWing.rotation.x = ely.leftWing.rotation.z = 14 * Math.PI / 180; ely.updateRightWing();
    let Vec; v.scene.traverse((o) => { if (!Vec && o.isMesh) Vec = o.position.constructor; });
    return { v, R, out, Vec };
  }
  // Frame the camera on one piece of equipment, seen from behind-left and above (yaw -137°, pitch 29.5°).
  function frame(G, part) {
    const { v, Vec } = G, cam = v.camera; v.scene.updateMatrixWorld(true);
    const pts = []; part.traverseVisible((o) => { if (!o.isMesh) return; const a = o.geometry.attributes.position; for (let i = 0; i < a.count; i++) pts.push(new Vec().fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld)); });
    const c = pts.reduce((s, p) => s.add(p), new Vec()).multiplyScalar(1 / pts.length);
    const yaw = -137 * Math.PI / 180, pitch = 29.5 * Math.PI / 180, d = 400;
    cam.fov = 6; cam.zoom = 1; cam.position.set(c.x + d * Math.cos(pitch) * Math.sin(yaw), c.y + d * Math.sin(pitch), c.z + d * Math.cos(pitch) * Math.cos(yaw));
    cam.lookAt(c); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    let m = 0; for (const p of pts) { const q = p.clone().project(cam); m = Math.max(m, Math.abs(q.x), Math.abs(q.y)); }
    cam.zoom = 0.86 / m; cam.updateProjectionMatrix();
  }
  function prep(mat, emissive) {
    if (mat.map) { mat.map.colorSpace = 'srgb'; mat.map.needsUpdate = true; }
    mat.side = 2; mat.transparent = false; mat.alphaTest = 0.5;
    if (emissive) { mat.emissive.setRGB(1, 1, 1); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.15; }
    mat.needsUpdate = true;
  }
  async function pump() {
    if (busy || !queue.length || !window.skinview3d) return;
    busy = true;
    try {
      if (!gen) { gen = await makeGen(); log('info', 'pictures: renderer ready'); }
      while (queue.length) {
        const { id, url } = queue.shift();
        try {
          const { v, R, out } = gen, p = v.playerObject;
          await v.loadCape(url, { makeVisible: false });
          prep(p.cape.material, false); prep(p.elytra.material, true);
          p.backEquipment = 'cape'; frame(gen, p.cape); R.render(v.scene, v.camera);
          PICS.set(id + '|cape', out.toDataURL('image/png'));
          // elytra only if the texture has an elytra part (same test as the 3D view)
          const cv = v.capeCanvas, k = cv.width / 64;
          const px = cv.getContext('2d', { willReadFrequently: true }).getImageData(22 * k, 0, 24 * k, 22 * k).data;
          let has = false; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) { has = true; break; }
          if (has) { p.backEquipment = 'elytra'; frame(gen, p.elytra); R.render(v.scene, v.camera); PICS.set(id + '|elytra', out.toDataURL('image/png')); }
          else PICS.set(id + '|elytra', null);
          dispatchEvent(new Event('capeart'));
        } catch (e) { PICS.set(id + '|cape', null); PICS.set(id + '|elytra', null); log('warn', 'pictures: ' + id + ' failed: ' + (e.message || e)); }
      }
    } finally { busy = false; }
  }

  // ---------- settings dialog ----------
  function settingsDialog() {
    let d = document.getElementById('cw-settings');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'cw-settings';
      d.innerHTML = `<form method="dialog" class="cw-set">
        <h3 data-k="settings"></h3>
        <fieldset><legend data-k="notif"></legend>
          <label><input type="checkbox" name="notifyNew"> <span data-k="nNew"></span></label>
          <label><input type="checkbox" name="notifyOpen"> <span data-k="nOpen"></span></label>
          <label><input type="checkbox" name="notifyEnding"> <span data-k="nEnding"></span></label>
        </fieldset>
        <label><input type="checkbox" name="autostart"> <span data-k="autostart"></span></label>
        <label class="cw-skin"><span data-k="skin"></span><input type="text" name="skinName" maxlength="16" autocomplete="off" spellcheck="false"><small data-k="skinHint"></small></label>
        <p class="cw-msg" aria-live="polite"></p>
        <div class="cw-actions"><button type="button" class="btn" data-k="save" value="save"></button><button class="btn ghost" data-k="close" value="close"></button></div>
      </form>`;
      document.body.append(d);
      const st = document.createElement('style');
      st.textContent = `#cw-settings{border:0;padding:0;max-width:min(420px,calc(100vw - 32px));background:var(--panel);color:var(--fg);box-shadow:inset 3px 3px 0 var(--bevel-hi),inset -3px -3px 0 var(--bevel-lo),0 20px 60px rgba(0,0,0,.35)}
        #cw-settings::backdrop{background:rgba(10,12,9,.55)} .cw-set{display:grid;gap:14px;padding:20px} .cw-set fieldset{border:0;padding:0;margin:0;display:grid;gap:8px}
        .cw-set legend{font-weight:700;margin-bottom:6px} .cw-set label{display:flex;gap:8px;align-items:center} .cw-skin{display:grid!important;gap:4px!important}
        .cw-skin input{font:inherit;padding:7px 10px;background:var(--bg);color:var(--fg);border:0;box-shadow:inset 2px 2px 0 var(--bevel-lo),inset -2px -2px 0 var(--bevel-hi)}
        .cw-skin small,.cw-msg{color:var(--muted);font-size:var(--text-sm);margin:0} .cw-actions{display:flex;gap:8px;justify-content:flex-end}
        #cw-open-settings{margin-inline-start:8px}`;
      document.head.append(st);
      d.querySelector('[value=save]').addEventListener('click', async () => {
        const f = d.querySelector('form');
        for (const k of ['notifyNew', 'notifyOpen', 'notifyEnding']) settings[k] = f[k].checked;
        const name = f.skinName.value.trim(); const changed = name !== settings.skinName; settings.skinName = name; saveSettings();
        try { const A = T?.autostart; if (A) { const on = await A.isEnabled(); if (f.autostart.checked && !on) await A.enable(); if (!f.autostart.checked && on) await A.disable(); } } catch (e) { log('warn', 'autostart: ' + (e.message || e)); }
        log('info', 'settings: saved', { notifyNew: settings.notifyNew, notifyOpen: settings.notifyOpen, notifyEnding: settings.notifyEnding, autostart: f.autostart.checked, skin: name || 'default' });
        const msg = d.querySelector('.cw-msg'); msg.textContent = '';
        if (changed) { const ok = await applySkin(name); msg.textContent = ok ? ui().skinOk : ui().skinBad; }
        if (!changed) d.close();
      });
    }
    const L = ui(); d.dir = lang() === 'he' ? 'rtl' : 'ltr';
    d.querySelectorAll('[data-k]').forEach((el) => { el.textContent = L[el.dataset.k]; });
    const f = d.querySelector('form');
    for (const k of ['notifyNew', 'notifyOpen', 'notifyEnding']) f[k].checked = !!settings[k];
    f.skinName.value = settings.skinName || ''; d.querySelector('.cw-msg').textContent = '';
    (T?.autostart?.isEnabled?.() || Promise.resolve(false)).then((on) => { f.autostart.checked = !!on; }).catch(() => {});
    d.showModal();
  }

  // ---------- wiring ----------
  // Links (donate, wiki, redeem, e-mail) open in the regular browser / mail app, never inside the app window.
  addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || !/^(https?:|mailto:)/.test(a.href)) return;
    e.preventDefault();
    try { invoke('plugin:opener|open_url', { url: a.href })?.catch((err) => log('error', 'open link failed', err)); } catch {}
  }, true);
  addEventListener('DOMContentLoaded', () => {
    const pick = document.getElementById('lang-pick');
    if (pick) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost'; b.id = 'cw-open-settings';
      const label = () => { b.textContent = '⚙ ' + ui().settings; };
      label(); document.getElementById('f-lang')?.addEventListener('change', () => setTimeout(label, 0));
      b.addEventListener('click', settingsDialog); pick.after(b);
    }
    // the page script has run by now: re-check the queue, apply the saved skin
    setTimeout(() => { pump(); if (settings.skinName) applySkin(settings.skinName); }, 0);
  });
  T?.event?.listen?.('check-now', () => refresh('tray'));
  T?.event?.listen?.('open-settings', () => settingsDialog());
  // Notification clicked: show that cape. If the notification was clicked later in the notification centre,
  // Windows starts the app again instead, so the running app opens the last notified cape (once, within a day).
  function openCape(id, why) {
    store.set('lastNotified', null);
    const page = window.CapeWatchPage;
    if (!id || !page?.openDetail) { log('warn', 'open cape: not possible', id, why); return; }
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    page.openDetail(id); log('info', 'open cape: ' + id + ' (' + why + ')');
  }
  T?.event?.listen?.('open-cape', (ev) => openCape(ev.payload, 'notification click'));
  T?.event?.listen?.('second-start', () => {
    const last = store.get('lastNotified', null);
    if (last && Date.now() - last.at < 24 * 3600 * 1000) openCape(last.id, 'notification centre');
  });
  log('info', 'start: apis', { notification: !!T?.notification, http: !!T?.http?.fetch, autostart: !!T?.autostart, event: !!T?.event });
  log('info', 'start: app shell ready, saved data ' + (data ? 'from ' + (data.status?.lastCheckAt || '?') : 'none'));
  refresh('start');
  setInterval(() => refresh('every 30 min'), POLL_MS);
})();
