// The robot's word filter, for the texts the language model writes about a new cape (robot.mjs), in the app's 7
// languages: swear words, sexual words and slurs against groups of people. The owner's rules:
//  1. A cape's official name (from the wiki or from Mojang) is never checked: only the model's texts are.
//  2. A text with such a word does not stop the cape: it is published and notified as usual, with the fixed template
//     sentence in place of that text.
//  3. Names in robot/allowed-words.json (every cape there has been, and things in the game: mobs, items, blocks,
//     places...) and the names of the capes in the data file are never marked (tools/make-allowed-words.mjs).
//  4. Whole words only: a word that merely contains one ("class", "Scunthorpe", "shiitake") is never caught.
//  5. Nothing in the data file today and no name on the allowed list is caught (tests/robot/offensive.test.mjs).
//  6. Every text replaced is written to the log, with the word and the field, and the owner gets a message (robot.yml).
// Matching ignores case, accents and common letter swaps next to letters ("sh1t", "$hit", "b!tch"), and lets a letter
// repeat ("shiiit"). A phrase may be written with or without its spaces ("hijo de puta", "hijodeputa").
import { readFileSync } from 'node:fs';

const LISTS = {
  En: ['fuck', 'fucks', 'fucked', 'fucker', 'fuckers', 'fucking', 'fuckin', 'motherfucker', 'motherfuckers', 'motherfucking', 'fuckhead', 'fuckface',
    'shit', 'shits', 'shite', 'shitty', 'shitting', 'shithead', 'shitheads', 'bullshit', 'horseshit', 'dipshit', 'bitch', 'bitches', 'bitching',
    'bitchy', 'son of a bitch', 'bastard', 'bastards', 'asshole', 'assholes', 'arsehole', 'arseholes', 'cunt', 'cunts', 'pussy', 'pussies',
    'whore', 'whores', 'slut', 'sluts', 'slutty', 'nigger', 'niggers', 'nigga', 'niggas', 'faggot', 'faggots', 'fag', 'fags', 'retard',
    'retards', 'retarded', 'twat', 'twats', 'wanker', 'wankers', 'dyke', 'dykes', 'tranny', 'trannies', 'chink', 'chinks', 'spic', 'spics',
    'kike', 'kikes', 'wetback', 'wetbacks', 'rape', 'raped', 'rapes', 'rapist', 'rapists', 'porn', 'porno', 'pornography', 'hitler', 'nazi',
    'nazis', 'kkk', 'dickhead', 'dickheads', 'cocksucker', 'cocksuckers'],
  He: ['זונה', 'זונות', 'הזונה', 'בן זונה', 'בת זונה', 'שרמוטה', 'שרמוטות', 'השרמוטה', 'כוס אמק', 'כוס אמא שלך', 'כוסית', 'כוסיות', 'זין', 'הזין',
    'מזדיין', 'מזדיינת', 'להזדיין', 'תזדיין', 'תזדייני', 'זיון', 'זיונים', 'מניאק', 'מניאקים', 'מניאקית', 'קוקסינל', 'קוקסינלים', 'ערבוש',
    'ערבושים', 'כושי', 'כושים', 'חרא', 'חארות', 'יא חרא'],
  Es: ['puta', 'putas', 'puto', 'putos', 'hijo de puta', 'hijos de puta', 'mierda', 'mierdas', 'cabron', 'cabrones', 'pendejo', 'pendejos', 'pendeja',
    'pendejas', 'maricon', 'maricones', 'marica', 'maricas', 'gilipollas', 'joder', 'jodido', 'jodida', 'jodidos', 'chinga', 'chingar', 'chingada',
    'chingado', 'culero', 'culeros', 'verga', 'vergas', 'carajo'],
  Pt: ['porra', 'caralho', 'caralhos', 'puta', 'putas', 'merda', 'merdas', 'foda', 'fodas', 'foder', 'foda se', 'fodido', 'fodida', 'buceta',
    'bucetas', 'viado', 'viados', 'arrombado', 'arrombada', 'vagabunda', 'vagabundas'],
  Fr: ['putain', 'putains', 'pute', 'putes', 'merde', 'merdes', 'merdique', 'connard', 'connards', 'connasse', 'connasses', 'salope', 'salopes',
    'salopard', 'encule', 'enculee', 'encules', 'enculer', 'pede', 'pedes', 'nique', 'niquer', 'fils de pute', 'enfoire', 'enfoiree', 'enfoires',
    'bougnoule', 'bougnoules', 'negre', 'negres'],
  De: ['scheisse', 'scheiss', 'fotze', 'fotzen', 'hurensohn', 'hurensohne', 'hure', 'huren', 'wichser', 'arschloch', 'arschlocher', 'schwuchtel',
    'schwuchteln', 'schlampe', 'schlampen', 'fick', 'ficken', 'fickt', 'fickte', 'gefickt', 'neger', 'kanake', 'kanaken', 'missgeburt',
    'missgeburten', 'spast', 'spasti', 'spastis', 'mongo', 'mongos'],
  Ru: ['хуй', 'хуя', 'хую', 'хуем', 'хуе', 'хуи', 'хуев', 'хуйня', 'хуйню', 'нахуй', 'похуй', 'пизда', 'пизды', 'пизде', 'пизду', 'пиздой', 'пиздец',
    'пиздеца', 'бля', 'блядь', 'бляди', 'блядский', 'блять', 'ебать', 'ебаный', 'ебанный', 'ебал', 'ебала', 'ебали', 'заебал', 'заебала', 'заебали',
    'заебись', 'уебок', 'уебки', 'уебище', 'ебло', 'сука', 'суки', 'сукин', 'суку', 'сукой', 'пидор', 'пидоры', 'пидора', 'пидорас', 'пидорасы',
    'пидар', 'пидарас', 'мудак', 'мудаки', 'мудака', 'гандон', 'гандоны', 'шлюха', 'шлюхи', 'шлюху', 'чмо']
};
const longestFirst = (a) => [...new Set(a)].sort((x, y) => y.length - x.length);   // a phrase wins over a word in it
const ALL = longestFirst(Object.values(LISTS).flat());
const ORDER = Object.fromEntries(Object.entries(LISTS).map(([k, v]) => [k, longestFirst(v)]));
export const LANG_KEYS = Object.keys(LISTS);

const LEET = { 0: 'o', 1: 'i', '!': 'i', 3: 'e', 4: 'a', '@': 'a', 5: 's', $: 's', 7: 't' };
// Lower case, no accents or niqqud, ß as ss, letter swaps undone, everything that is not a letter or digit a space.
// A swap counts only next to a letter ("sh1t", "$hit"; "2023" stays a number), and "!" only before one ("b!tch"; "Shit!"
// keeps its exclamation mark).
export function normalize(text) {
  return String(text ?? '').toLowerCase().normalize('NFKD').replace(/\p{M}+/gu, '').replace(/ß/g, 'ss')
    .replace(/[01!34@5$7](?=\p{L})|(?<=\p{L})[0134@5$7]/gu, (c) => LEET[c]).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const B = '(?<![\\p{L}\\p{N}])', E = '(?![\\p{L}\\p{N}])';   // whole word: no letter or digit before or after
// a word on the lists: each letter may repeat, the words of a phrase with or without the space between them
const rules = new Map(ALL.map((p) => [p, new RegExp(B + normalize(p).split(' ').map((w) => [...w].map((c) => esc(c) + '+').join('')).join(' ?') + E, 'gu')]));

// The allowed names, as one search (longest first, so "Zombie Horse" wins over "Zombie"). More can be added (the
// capes of the data file); a name is matched exactly, as whole words.
const ALLOWED_FILE = JSON.parse(readFileSync(new URL('./allowed-words.json', import.meta.url), 'utf8'));
const allowedNames = new Set([...ALLOWED_FILE.capes, ...ALLOWED_FILE.game].map(normalize).filter(Boolean));
let allowedRe = null;
export function allow(names) {
  for (const n of names) { const x = normalize(n); if (x) allowedNames.add(x); }
  allowedRe = null;
}
function allowedSpans(n) {
  allowedRe ||= new RegExp(B + '(?:' + [...allowedNames].sort((a, b) => b.length - a.length).map(esc).join('|') + ')' + E, 'gu');
  return [...n.matchAll(allowedRe)].map((m) => [m.index, m.index + m[0].length]);
}

// The first word on the lists found in the text, in its language ('En', 'He', ... or 'all' for every list), outside
// the allowed names: { word: as found (normalized), listed: the word on the list } or null.
export function offensive(text, lang = 'all') {
  const n = normalize(text);
  if (!n) return null;
  const spans = allowedSpans(n);
  for (const p of lang === 'all' ? ALL : ORDER[lang] || ALL) {
    for (const m of n.matchAll(rules.get(p))) {
      const a = m.index, b = a + m[0].length;
      if (!spans.some(([x, y]) => a < y && x < b)) return { word: m[0], listed: p };
    }
  }
  return null;
}
