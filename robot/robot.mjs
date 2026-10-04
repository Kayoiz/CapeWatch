// CapeWatch robot: runs twice a day on GitHub Actions and keeps data/capewatch.json up to date.
// The data file holds text and ids only (texture ids, wiki page titles). No images, ever.
// minecraft.wiki is used only as a source of facts; every sentence in the file is written fresh
// (by GitHub Models, or from the pre-translated templates), never copied from the wiki.
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { LANGS, NEW_OBTAIN, NEW_SHORT, EVENT, fill } from './templates.mjs';

// The tests (tests/robot/) point CAPEWATCH_DATA at a copy; on GitHub it is always the repo's data file.
const DATA = process.env.CAPEWATCH_DATA ? pathToFileURL(process.env.CAPEWATCH_DATA) : new URL('../data/capewatch.json', import.meta.url);
const UA = { 'User-Agent': 'CapeWatchBot/1.0 (+https://github.com/Kayoiz/CapeWatch)' };
const WIKI = 'https://minecraft.wiki/api.php';
const MODELS = 'https://models.github.ai/inference/chat/completions';
const MODEL = process.env.CAPEWATCH_MODEL || 'openai/gpt-4.1-mini';
const DRY = process.argv.includes('--dry');          // compute and log, but do not write the file
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const log = (...a) => console.log('[' + nowIso() + ']', ...a);

// Pages in Category:Capes that are not one account cape (lists, other games, disambiguations).
const SKIP_TITLES = new Set(['Cape', 'Movie Cape', 'Cape/Gallery']);
// Capes the owner removed from CapeWatch: never add them back (they would come back as "new").
const REMOVED_TITLES = new Set(["Cheapsh0t's Cape", 'Chinese Translator Cape', 'Translator Cape#Chinese Translator Cape']);

export async function wiki(params) {
  const url = WIKI + '?' + new URLSearchParams({ ...params, format: 'json', formatversion: '2' });
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error('wiki ' + r.status + ' for ' + params.action);
  return r.json();
}

export async function categoryTitles() {
  const titles = [];
  let cont;
  do {
    const d = await wiki({ action: 'query', list: 'categorymembers', cmtitle: 'Category:Capes', cmlimit: '500', cmnamespace: '0', ...(cont ? { cmcontinue: cont } : {}) });
    titles.push(...d.query.categorymembers.map((m) => m.title));
    cont = d.continue?.cmcontinue;
  } while (cont);
  return titles;
}

export async function pageText(title) {
  const d = await wiki({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', titles: title });
  return d.query.pages[0]?.revisions?.[0]?.slots?.main?.content || '';
}

// Facts from the infobox: editions, API name, texture id.
export function infobox(text) {
  const m = text.match(/\{\{Infobox cape([\s\S]*?)\n?\}\}/);
  if (!m) return null;
  const field = (k) => (m[1].match(new RegExp('\\|\\s*' + k + '\\s*=\\s*([^\\n|]*)')) || [])[1]?.trim() || '';
  const yes = (v) => /^yes/i.test(v);
  return { je: yes(field('je')), be: yes(field('be')), api: field('api').replace(/'''|<[^>]+>/g, '').trim(), textureId: (field('texture-id').match(/[0-9a-f]{40,}/) || [])[0] || '' };
}

// Plain facts for the writer: wiki markup stripped, short.
export function plain(text) {
  return text.replace(/\{\{[^{}]*\}\}/g, ' ').replace(/<ref[\s\S]*?<\/ref>|<ref[^>]*\/>/g, ' ').replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\S+\s([^\]]*)\]/g, '$1').replace(/'''?|<[^>]+>/g, '').replace(/\n{2,}/g, '\n').trim().slice(0, 3500);
}

export const slug = (name) => name.toLowerCase().replace(/\bcape\b/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Writes the cape's texts in all 7 languages from the facts, in its own words. Returns null if unavailable.
export async function writeTexts(name, facts) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) { log('models: no GITHUB_TOKEN, using templates'); return null; }
  const keys = LANGS.flatMap((l) => ['obtain' + l, 'short' + l]);
  const prompt = `You write short texts for CapeWatch, an unofficial Minecraft cape tracker.
Cape: ${name}
Facts (from minecraft.wiki; use only as facts, write everything in your own words, never copy sentences):
${facts}

Return JSON with these keys: ${keys.join(', ')}, availability, availableFrom, availableUntil, cost.
- obtain*: 1-3 plain sentences: how to get it and any deadline. Wrap the key facts (the action, time needed, deadline) in **double asterisks**.
- short*: one sentence, at most 15 words, with the key facts in **double asterisks**.
- Languages: En English, He Hebrew, Es Spanish, Pt Portuguese, Fr French, De German, Ru Russian. Keep proper names (cape names, game names, Twitch, TikTok) in English.
- availability: one of available, announced, ended, exclusive, permanent. availableFrom/availableUntil: YYYY-MM-DD or null. cost: "free" (only a Minecraft account needed) or "paid", or null for capes nobody can obtain.
- If a fact is unknown, say so plainly instead of guessing.`;
  try {
    const r = await fetch(MODELS, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ model: MODEL, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] })
    });
    if (!r.ok) { log('models: HTTP ' + r.status + ', using templates'); return null; }
    const j = await r.json();
    const out = JSON.parse(j.choices?.[0]?.message?.content || '{}');
    const missing = keys.filter((k) => typeof out[k] !== 'string' || !out[k].trim());
    if (missing.length) { log('models: missing ' + missing.join(','), 'using templates'); return null; }
    log('models: texts written for', name);
    return out;
  } catch (e) { log('models: failed (' + (e.message || e) + '), using templates'); return null; }
}

export function addEvent(data, type, cape, id, at) {
  const ev = { at, type, capeId: id, capeName: cape.name };
  for (const l of LANGS) ev['text' + l] = fill(EVENT[type][l], cape.name);
  const key = at.slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2') + '-' + id + '-' + type;
  data.events[key] = ev;
  log('event:', type, id);
}

// One check: new capes from the wiki, then promotions opening / ending from the known dates, then the status line.
// Changes `data` in place and returns the result line. `at` and `now` are the check's time (the tests set them).
export async function check(data, { at = nowIso(), now = Date.now() } = {}) {
  data.capes ||= {};
  data.events ||= {};
  const problems = [];
  let added = 0, changed = 0;

  // 1) new capes from the wiki category
  const known = new Set(Object.values(data.capes).flatMap((c) => [c.name, (c.wikiTitle || '').split('#')[0]]).filter(Boolean));
  let titles = [];
  try { titles = await categoryTitles(); log('wiki: ' + titles.length + ' pages in Category:Capes'); }
  catch (e) { problems.push('wiki category unreachable'); log('wiki: category failed:', e.message); }
  for (const title of titles) {
    if (known.has(title) || SKIP_TITLES.has(title) || REMOVED_TITLES.has(title) || title.includes('/') || /duplicate/i.test(title)) continue;
    let text = '';
    try { text = await pageText(title); } catch (e) { problems.push('page ' + title); log('wiki: page failed', title, e.message); continue; }
    const box = infobox(text);
    if (!box || (!box.je && !box.be) || /disambiguation/i.test(text.slice(0, 500))) { log('skip (not an account cape):', title); continue; }
    const id = slug(title);
    if (data.capes[id]) continue;
    const written = await writeTexts(title, plain(text));
    // The model's answer is checked before it goes into the file: a value the app does not know is dropped.
    const AVAIL = ['available', 'announced', 'ended', 'exclusive', 'permanent'];
    const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const cape = {
      name: title, wikiTitle: title, apiAlias: box.api || undefined, textureId: box.textureId || undefined,
      editions: [box.je && 'java', box.be && 'bedrock'].filter(Boolean), category: 'other',
      availability: AVAIL.includes(written?.availability) ? written.availability : 'announced',
      availableFrom: day(written?.availableFrom), availableUntil: day(written?.availableUntil),
      cost: ['free', 'paid'].includes(written?.cost) ? written.cost : undefined, releaseDate: at.slice(0, 10), source: 'robot', detectedAt: at
    };
    for (const l of LANGS) {
      cape['obtain' + l] = written ? written['obtain' + l] : fill(NEW_OBTAIN[l], title);
      cape['short' + l] = written ? written['short' + l] : NEW_SHORT[l];
    }
    data.capes[id] = JSON.parse(JSON.stringify(cape));   // drops undefined fields
    addEvent(data, 'new', cape, id, at);
    added++;
  }

  // 2) promotions opening, ending soon and ending, from the dates already known
  const endOf = (s) => { if (!s) return null; const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T23:59:59Z' : s); return isNaN(d) ? null : d.getTime(); };
  const startOf = (s) => { if (!s) return null; const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00Z' : s); return isNaN(d) ? null : d.getTime(); };
  for (const [id, c] of Object.entries(data.capes)) {
    const end = endOf(c.availableUntil), start = startOf(c.availableFrom);
    if (c.availability === 'announced' && start && start <= now && (!end || end > now)) { c.availability = 'available'; addEvent(data, 'available', c, id, at); changed++; }
    // opened and already closed again between two checks: straight to "ended"
    else if (c.availability === 'announced' && start && start <= now && end && end <= now) { c.availability = 'ended'; addEvent(data, 'ended', c, id, at); changed++; }
    if (c.availability === 'available' && end && end <= now) { c.availability = 'ended'; addEvent(data, 'ended', c, id, at); changed++; }
    else if (c.availability === 'available' && end && end - now < 48 * 3600e3 && !c.remindedAt) { c.remindedAt = at; addEvent(data, 'ending', c, id, at); changed++; }
  }

  // 3) status, always
  const result = `${added} new, ${changed} changed` + (problems.length ? '; problems: ' + problems.join(', ') : '');
  data.status = { lastCheckAt: at, lastResult: result, capeCount: Object.keys(data.capes).length };
  data.capes = Object.fromEntries(Object.entries(data.capes).sort(([a], [b]) => a.localeCompare(b)));
  log('result:', result);
  return result;
}

async function main() {
  const data = JSON.parse(await fs.readFile(DATA, 'utf8'));
  await check(data);
  if (DRY) { log('dry run: file not written'); return; }
  await fs.writeFile(DATA, JSON.stringify(data, null, 1) + '\n');
  log('wrote', DATA.pathname);
}

// Run only when started as a program (node robot/robot.mjs), not when the tests import it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error('[robot] fatal:', e); process.exit(1); });
