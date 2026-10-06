// The robot's word filter (robot/offensive.mjs), on the owner's rules: whole words only, in each language (also
// written in disguise); never a name on the allowed list (every cape there has been, things in the game); and nothing
// marked in the data file today or in the list of names from the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { offensive, normalize, allow, LANG_KEYS } from '../../robot/offensive.mjs';

const DATA = JSON.parse(readFileSync(new URL('../../data/capewatch.json', import.meta.url), 'utf8'));
const ALLOWED = JSON.parse(readFileSync(new URL('../../robot/allowed-words.json', import.meta.url), 'utf8'));

test('caught in each language, also with capitals, accents, letter swaps and repeated letters; it says which word', () => {
  const caught = {
    En: ['What the FUCK', 'Sh1t happens', 'Shit!', 'shiiit', 'a b!tch', 'Son of a bitch', 'N1gger', '$hitty'],
    He: ['בן זונה', 'בןזונה', 'יא שרמוטה', 'כוס אמק', 'מניאק'],
    Es: ['Hijo de puta', 'hijodeputa', 'MIERDA', 'cabrón'],
    Pt: ['Caralho!', 'que porra', 'foda-se'],
    Fr: ['Putain', 'fils de pute', 'enculé', 'Merde alors'],
    De: ['Scheiße', 'SCHEISSE', 'Hurensohn', 'Arschloch'],
    Ru: ['Хуй', 'пиздец', 'блядь', 'Сука', 'нахуй']
  };
  for (const [lang, texts] of Object.entries(caught)) {
    for (const t of texts) {
      assert.ok(offensive(t, lang), lang + ': ' + t);
      assert.ok(offensive(t), 'all lists: ' + t);
    }
  }
  assert.deepEqual(offensive('Get it, you b!tch.', 'En'), { word: 'bitch', listed: 'bitch' });
});

test('whole words only: a word that merely contains one, or one cut up with dots or spaces, is not caught', () => {
  const fine = {
    En: ['Scunthorpe', 'class', 'assassin', 'cocktail', 'grape', 'fire retardant', 'shiitake', 'Dickens', 'Sussex', 'cockatoo', 'unique', 'a pass',
      'motherf.u.c.k.e.r', 'f u c k', 'Migrator Cape', 'MINECON 2011', '15th Anniversary'],
    He: ['מזין', 'כוס מים', 'הזמנה', 'שזירה', 'זוהרות'],
    Es: ['computadora', 'disputa', 'reputación', 'cono', 'capas obtenidas'],
    Pt: ['cuidado', 'computador', 'pede ajuda', 'reputação', 'curso'],
    Fr: ['unique', 'computer', 'député', 'pédale de vélo', 'magnifique'],
    De: ['Wickel', 'Schein', 'Spaß', 'Mongolei', 'Kanal'],
    Ru: ['хлеба', 'скука', 'сукно', 'ребята', 'страховка']
  };
  for (const [lang, texts] of Object.entries(fine)) for (const t of texts) assert.equal(offensive(t, lang), null, lang + ': ' + t);
});

test('the allowed list: every cape there has been and every name from the game, also inside a sentence, in every language', () => {
  assert.ok(ALLOWED.capes.length > 100 && ALLOWED.game.length > 1000, 'the list is there');
  const marked = [];
  for (const name of [...ALLOWED.capes, ...ALLOWED.game]) {
    for (const lang of ['all', ...LANG_KEYS]) {
      if (offensive(name, lang)) marked.push(lang + ': ' + name);
      if (offensive('Get the ' + name + ' before it ends.', lang)) marked.push(lang + ' (in a sentence): ' + name);
    }
  }
  assert.deepEqual(marked, []);
});

test('the allowed list works: a cape name that holds a listed word is never marked in a text, the word alone still is', () => {
  allow(['Sample Puta Cape']);
  assert.equal(offensive('Consigue la Sample Puta Cape antes de que termine.', 'Es'), null);
  assert.ok(offensive('Puta.', 'Es'));
});

test('nothing in the data file today is marked: every cape name, every text in its own language, every news text', () => {
  const hits = [];
  for (const [id, c] of Object.entries(DATA.capes)) {
    if (offensive(c.name)) hits.push(id + ' name: ' + c.name);
    for (const l of LANG_KEYS) for (const k of ['obtain' + l, 'short' + l]) {
      const hit = typeof c[k] === 'string' && offensive(c[k], l);
      if (hit) hits.push(id + ' ' + k + ': ' + hit.word);
    }
  }
  for (const [id, e] of Object.entries(DATA.events || {})) for (const l of LANG_KEYS) if (typeof e['text' + l] === 'string' && offensive(e['text' + l], l)) hits.push('event ' + id + ' text' + l);
  assert.deepEqual(hits, []);
});

test('normalize: lower case, no accents or niqqud, letter swaps undone next to letters, ß as ss', () => {
  assert.equal(normalize('ÉNCULÉ  Scheiße'), 'encule scheisse');
  assert.equal(normalize('$h1t!!'), 'shit', 'an exclamation mark stays one');
  assert.equal(normalize('b!tch 2023'), 'bitch 2023', 'a number stays a number');
  assert.equal(normalize('שָׁלוֹם'), 'שלום');
  assert.equal(normalize(null), '');
});
