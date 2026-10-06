// THIRD-PARTY-NOTICES.txt: the licenses of everything by other people inside CapeWatch for Windows (made by
// tools/make-licenses.mjs). It has to match what the app is built from now: a new crate, a new version or a new Rust
// without a new file fails here, before a release can go out with an old list. Also: the installed app carries it,
// and every crate, part and license text in it is complete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { make, inputs, inputsHash, choices, OUT } from '../../tools/make-licenses.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => readFileSync(p, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const FILE = read(OUT);
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const works = (cmd) => { try { execFileSync(cmd, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } };
const noRust = !(works('cargo') && works('rustc')) && 'Rust (cargo, rustc) is not installed';
// part n of the file (1 to 7)
const part = (n) => FILE.slice(FILE.indexOf('\n' + n + '. '), n < 7 ? FILE.indexOf('\n' + (n + 1) + '. ') : undefined);

test('made from the Cargo.lock, the license files and the tool in the repo now (else: node tools/make-licenses.mjs)', () => {
  assert.ok(inputs().includes('app/src-tauri/Cargo.lock') && inputs().length >= 10);
  assert.match(FILE, new RegExp('\\(inputs\\s+' + inputsHash() + '\\)'), 'THIRD-PARTY-NOTICES.txt is out of date: run node tools/make-licenses.mjs');
});

test('exactly what the tool makes now, with the Rust installed now (else: node tools/make-licenses.mjs)', { skip: noRust }, () => {
  assert.ok(make().doc === FILE, 'THIRD-PARTY-NOTICES.txt is out of date (a crate or Rust changed): run node tools/make-licenses.mjs');
});

test('every crate compiled into capewatch.exe is listed with its version and license, and points to a text that is there', { skip: noRust }, () => {
  // cargo itself, not the tool: the normal dependencies on Windows x64, procedural macros left out
  const tree = execFileSync('cargo', ['tree', '--offline', '--locked', '-e', 'normal,no-proc-macro', '--target', 'x86_64-pc-windows-msvc', '--prefix', 'none', '-f', '{p}|{l}'],
    { cwd: ROOT + 'app/src-tauri', encoding: 'utf8' });
  const crates = new Map(tree.split('\n').map((l) => /^(\S+) v(\S+)[^|]*\|(.*?)( \(\*\))?$/.exec(l.trim())).filter((m) => m && m[1] !== 'capewatch').map((m) => [m[1] + ' ' + m[2], m[3].trim()]));
  assert.ok(crates.size > 150, 'cargo tree found ' + crates.size);
  const lines = part(1).split('\n');
  for (const [key, license] of crates) {
    const line = lines.find((l) => l.startsWith(key + ' — '));
    assert.ok(line, key + ' is missing');
    assert.ok(line.startsWith(key + ' — ' + license), key + ': license ' + license);
    assert.match(line, /\[\d+\]$/, key + ': no license text');
  }
  assert.equal(lines.filter((l) => / — .*\[\d+\]$/.test(l)).length, crates.size, 'nothing listed that is not in the program');
  assert.match(FILE, new RegExp('1\\. Rust crates compiled into capewatch\\.exe \\(' + crates.size + '\\)'));
  // a crate's NOTICE and COPYRIGHT files go with it, whichever license is used (Apache 2.0 asks for its NOTICE)
  const meta = JSON.parse(execFileSync('cargo', ['metadata', '--offline', '--locked', '--format-version', '1', '--filter-platform', 'x86_64-pc-windows-msvc'], { cwd: ROOT + 'app/src-tauri', encoding: 'utf8', maxBuffer: 256 << 20 }));
  const all = flat(FILE);
  let notices = 0;
  for (const p of meta.packages.filter((x) => crates.has(x.name + ' ' + x.version))) {
    const dir = dirname(p.manifest_path);
    for (const f of readdirSync(dir).filter((n) => /^(notice|copyright)([-_.].*)?$/i.test(n))) { notices++; assert.ok(all.includes(flat(read(join(dir, f)))), p.name + ' ' + p.version + ': ' + f + ' is not in it'); }
  }
  assert.ok(notices >= 5, notices + ' notice files');
});

test('every [n] in parts 1 to 6 leads to a license text in part 7, and every text there is used', () => {
  const used = new Set([1, 2, 3, 4, 5, 6].flatMap((n) => [...part(n).matchAll(/\[(\d+)\]/g)].map((m) => +m[1])));
  const texts = [...part(7).matchAll(/^\[(\d+)\] (.+)\n {4}Used by: /gm)].map((m) => +m[1]);
  assert.ok(texts.length > 50);
  assert.deepEqual(texts, texts.map((_, i) => i + 1), 'numbered 1, 2, 3, ...');
  assert.deepEqual([...used].sort((a, b) => a - b), texts, 'no text without a user, no number without a text');
});

test('the parts beyond the crates: the Rust standard library, WebView2, the JavaScript libraries, the fonts, the installer', () => {
  assert.match(part(2), /Rust’s own code — texts( \[\d+\])+:\n {2}everything not named below — Apache-2\.0 OR MIT \(Apache-2\.0\) — Copyright: The Rust Project Developers/);
  assert.match(part(2), /\n {2}hashbrown \d[\d.]* — MIT OR Apache-2\.0 \(MIT\) — \[\d+\]/);
  assert.match(part(3), /WebView2LoaderStatic\.lib[\s\S]*linked into capewatch\.exe by\s+webview2-com-sys/);
  // word for word: the texts kept in the repo
  const kept = ['tools/licenses', 'vendor/skinview3d', 'assets/fonts/google'].flatMap((d) => readdirSync(ROOT + d).filter((f) => /\.txt$/.test(f)).map((f) => d + '/' + f));
  assert.ok(kept.length >= 10);
  const all = flat(FILE);
  for (const f of kept) assert.ok(all.includes(flat(read(ROOT + f))), f + ' is not in it word for word');
});

test('the installed app carries it, next to capewatch.exe', () => {
  const conf = JSON.parse(read(ROOT + 'app/src-tauri/tauri.conf.json'));
  assert.equal(conf.bundle.resources['../../THIRD-PARTY-NOTICES.txt'], 'THIRD-PARTY-NOTICES.txt');
});

test('license choices: "OR", the old "/", "AND", brackets and "WITH"', () => {
  assert.deepEqual(choices('MIT OR Apache-2.0'), [['MIT'], ['Apache-2.0']]);
  assert.deepEqual(choices('MIT/Apache-2.0'), [['MIT'], ['Apache-2.0']]);
  assert.deepEqual(choices('Apache-2.0 AND ISC'), [['Apache-2.0', 'ISC']]);
  assert.deepEqual(choices('(Apache-2.0 OR MIT) AND BSD-3-Clause'), [['Apache-2.0', 'BSD-3-Clause'], ['MIT', 'BSD-3-Clause']]);
  assert.deepEqual(choices('Apache-2.0 WITH LLVM-exception OR MIT'), [['Apache-2.0 WITH LLVM-exception'], ['MIT']]);
});
