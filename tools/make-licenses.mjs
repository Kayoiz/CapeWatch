// Makes THIRD-PARTY-NOTICES.txt: every piece of software by other people that is part of CapeWatch for Windows, with
// its license text, as those licenses ask (MIT, BSD, ISC: the copyright notice and the license with every copy;
// Apache: a copy of the license and the crate's NOTICE files). The file goes into the installed app (tauri.conf.json,
// "resources") and stays in the repo.
//   1. The Rust crates compiled into capewatch.exe: cargo tree, the normal dependencies on Windows x64. Build scripts,
//      procedural macros and tests are left out: they run while the app is built, their code is not in it. Each
//      crate's own license files come from Cargo's download of it.
//   2. The Rust standard library: Rust's own notice (COPYRIGHT-library.html, which comes with Rust), for the crates
//      the standard library links on Windows.
//   3. Microsoft's WebView2 loader, which webview2-com-sys links into the program.
//   4. The JavaScript libraries (vendor/) and 5. the fonts (assets/fonts/google) inside the app.
//   6. The installer and uninstaller: NSIS and Tauri's NSIS plugin.
// Texts that do not come with a download are kept in tools/licenses (see its README).
// Where a crate offers a choice of licenses, MIT is used when it ships the MIT text, then Apache 2.0, then the others.
// Run: node tools/make-licenses.mjs   (again after any change to app/src-tauri/Cargo.lock or a new Rust version:
// tests/unit/licenses.test.mjs says when)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TAURI = join(ROOT, 'app', 'src-tauri');
const TARGET = 'x86_64-pc-windows-msvc';
export const OUT = join(ROOT, 'THIRD-PARTY-NOTICES.txt');
const read = (p) => readFileSync(p, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: TAURI, encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });

// What the file is made from in this repo (and this script): when one of them changes, the file is made again.
// Line ends do not count (Git may turn them into CRLF on Windows). The crates' own license files are covered by
// Cargo.lock: a crate version on crates.io never changes.
export function inputs(root = ROOT) {
  const list = (dir, re) => (existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter((f) => re.test(f)).map((f) => dir + '/' + f) : []);
  return ['app/src-tauri/Cargo.lock', 'tools/make-licenses.mjs', ...list('tools/licenses', /\.txt$/), ...list('vendor/skinview3d', /^LICENSE-.*\.txt$/), ...list('assets/fonts/google', /^OFL-.*\.txt$/)].sort();
}
export function inputsHash(root = ROOT) {
  const h = createHash('sha256');
  for (const f of inputs(root)) h.update(f + '\0' + read(join(root, f)) + '\0');
  return h.digest('hex').slice(0, 16);
}
export const rustVersion = () => /^rustc (\S+)/.exec(execFileSync('rustc', ['--version'], { encoding: 'utf8' }))?.[1] || null;

// ---------- licenses: expressions, texts, choices ----------
// "MIT OR Apache-2.0", "MIT/Apache-2.0" (the old way of writing it), "(Apache-2.0 OR MIT) AND BSD-3-Clause" -> the
// choices, each a list of licenses that all apply: [['Apache-2.0', 'BSD-3-Clause'], ['MIT', 'BSD-3-Clause']]
export function choices(expr) {
  const tok = String(expr).replace(/\//g, ' OR ').replace(/([()])/g, ' $1 ').split(/\s+/).filter(Boolean);
  let i = 0;
  const atom = () => {
    if (tok[i] === '(') { i++; const a = any(); i++; return a; }
    let id = tok[i++];
    if (tok[i] === 'WITH') { id += ' WITH ' + tok[i + 1]; i += 2; }
    return [[id]];
  };
  const all = () => { let a = atom(); while (tok[i] === 'AND') { i++; const b = atom(); a = a.flatMap((x) => b.map((y) => [...x, ...y])); } return a; };
  const any = () => { let a = all(); while (tok[i] === 'OR') { i++; a = a.concat(all()); } return a; };
  return any();
}
const base = (id) => id.replace(/ WITH .*/, '');
// Which licenses a text is (by words only that license has, line breaks, comment marks and quote marks aside), and
// what to call it.
const KINDS = [
  ['Apache-2.0', 'Apache License 2.0', /Apache License,? Version 2\.0, January 2004/i],
  ['MIT', 'MIT License', /Permission is hereby granted, free of charge, to any person obtaining a copy of this software/i],
  ['ISC', 'ISC License', /Permission to use, copy, modify, and(\/or)? distribute this software for any purpose with or without fee is hereby granted, provided that/i],
  ['BSD-3-Clause', 'BSD 3-Clause License', /Redistribution and use in source and binary forms.*(Neither the name|may not be used to endorse)/i],
  ['BSD-2-Clause', 'BSD 2-Clause License', /Redistribution and use in source and binary forms(?!.*(Neither the name|may not be used to endorse))/i],
  ['Zlib', 'zlib License', /provided 'as-is', without any express or implied warranty/i],
  ['Unlicense', 'The Unlicense', /This is free and unencumbered software released into the public domain/i],
  ['BSL-1.0', 'Boost Software License 1.0', /Boost Software License - Version 1\.0/i],
  ['CC0-1.0', 'CC0 1.0 Universal', /CC0 1\.0 Universal/i],
  ['Unicode-3.0', 'Unicode License v3', /UNICODE LICENSE V3|UNICODE, INC\. LICENSE AGREEMENT/i],
  ['MPL-2.0', 'Mozilla Public License 2.0', /Mozilla Public License,? (Version |v\. ?)2\.0/i],
  ['CDLA-Permissive-2.0', 'Community Data License Agreement – Permissive 2.0', /Community Data License Agreement ?[-–] ?Permissive ?[-–] ?Version 2\.0/i],
  ['OFL-1.1', 'SIL Open Font License 1.1', /SIL OPEN FONT LICENSE Version 1\.1/i]
];
const kindsOf = (text) => {
  const t = text.replace(/^[ \t]*(\/\/+|#+|\*+)[ \t]?/gm, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ');   // also when written as comments
  return new Set(KINDS.filter(([, , re]) => re.test(t)).map(([id]) => id));
};
const titleOf = (kinds, name) => (kinds.size ? KINDS.filter(([id]) => kinds.has(id)).map(([, t]) => t).join(' and ') : 'Notice (' + name + ')');
// a choice offered by a crate: MIT first, then Apache 2.0, then the others
const PREFER = ['MIT', 'MIT-0', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Zlib', 'Unlicense', 'CC0-1.0', 'BSL-1.0', 'Unicode-3.0', 'MPL-2.0', 'CDLA-Permissive-2.0'];
const rank = (id) => { const k = PREFER.indexOf(base(id)); return k < 0 ? PREFER.length : k; };
// a license text file counts for the license it is (an MIT text also for MIT-0, which only drops a condition)
const covers = (f, id) => f.kinds.has(base(id)) || (base(id) === 'MIT-0' && f.kinds.has('MIT'));

// ---------- the text pool: every text once, with all that use it ----------
const pool = new Map();   // normalized text -> { title, text, users }
const norm = (s) => s.replace(/\s+/g, ' ').trim();
function addText(text, title, user) {
  const key = norm(text);
  let e = pool.get(key);
  if (!e) pool.set(key, (e = { title, text: text.replace(/\s+$/gm, '').replace(/^\n+|\n+$/g, ''), users: [] }));
  if (!e.users.includes(user)) e.users.push(user);
  return e;
}

// ---------- 1. Rust crates ----------
const LICENSE_FILE = /^(licen[cs]e|copying|unlicen[cs]e|notice|copyright)([-_. ].*)?$/i;
const NOT_TEXT = /\.(spdx|html?|json|toml|rs)$/i;
const repoKey = (u) => String(u || '').toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '');
// Texts for crates that ship none (tools/licenses/README.md says where each is from).
const KEPT = { 'webview2-com': 'webview2-rs.txt', 'webview2-com-sys': 'webview2-rs.txt' };
function crateFiles(p) {
  const dir = dirname(p.manifest_path);
  return readdirSync(dir).filter((f) => LICENSE_FILE.test(f) && !NOT_TEXT.test(f)).sort()
    .map((name) => { const text = read(join(dir, name)); return { name, text, kinds: kindsOf(text) }; });
}
function rustCrates(rustDocs) {
  const meta = JSON.parse(run('cargo', ['metadata', '--offline', '--locked', '--format-version', '1', '--filter-platform', TARGET]));
  const rootPkg = meta.packages.find((p) => p.id === meta.resolve.root);
  const byKey = new Map(meta.packages.map((p) => [p.name + ' ' + p.version, p]));
  const tree = run('cargo', ['tree', '--offline', '--locked', '-e', 'normal,no-proc-macro', '--target', TARGET, '--prefix', 'none', '-f', '{p}']);
  const keys = [...new Set(tree.split('\n').map((l) => /^(\S+) v(\S+)/.exec(l.trim())).filter(Boolean).map((m) => m[1] + ' ' + m[2]))]
    .filter((k) => k !== rootPkg.name + ' ' + rootPkg.version).sort((a, b) => a.localeCompare(b, 'en'));
  const out = [];
  for (const key of keys) {
    const p = byKey.get(key);
    if (!p) throw new Error(key + ': not in cargo metadata');
    const files = crateFiles(p), license = p.license || 'see its license file';
    // where each license's text comes from: the crate, a crate from the same repository, tools/licenses, the
    // standard Apache 2.0 text (it names no copyright holder); null when there is none
    const from = (id) => {
      const own = files.filter((f) => covers(f, id));
      if (own.length) return { files: own };
      for (const q of meta.packages) {
        if (q === p || !p.repository || repoKey(q.repository) !== repoKey(p.repository)) continue;
        const sib = crateFiles(q).filter((f) => covers(f, id));
        if (sib.length) return { files: sib, note: 'text from ' + q.name + ', same repository' };
      }
      if (KEPT[p.name]) { const text = read(join(ROOT, 'tools', 'licenses', KEPT[p.name])); if (kindsOf(text).has(base(id))) return { files: [{ name: KEPT[p.name], text, kinds: kindsOf(text) }], note: 'text from its repository (tools/licenses/' + KEPT[p.name] + ')' }; }
      if (base(id) === 'Apache-2.0') return { files: [{ name: 'Apache-2.0', text: read(join(rustDocs, 'licenses', 'Apache-2.0.txt')), kinds: new Set(['Apache-2.0']) }], note: 'the standard Apache 2.0 text' };
      return null;
    };
    const alts = p.license ? choices(p.license) : [['(file)']];
    const score = (g) => { const s = g.map(from); return [s.filter((x) => !x).length, s.filter((x) => x && x.note).length, g.reduce((n, id) => n + rank(id), 0)]; };
    const pick = p.license ? [...alts].sort((a, b) => { const x = score(a), y = score(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; })[0] : null;
    const texts = [], notes = [];
    if (pick) {
      for (const id of pick) {
        const got = from(id);
        if (!got) throw new Error(key + ': no text for ' + id + ' (' + license + '). Put one in tools/licenses and name it in KEPT.');
        texts.push(...got.files); if (got.note) notes.push(got.note);
      }
    }
    // the crate's notices (NOTICE, COPYRIGHT, a statement of its licensing) always; with no license given, every file
    for (const f of files) if ((!f.kinds.size || !pick) && !texts.includes(f)) texts.push(f);
    if (!texts.length) throw new Error(key + ': no license text found');
    const user = p.name + ' ' + p.version;
    const entries = [...new Set(texts.map((f) => addText(f.text, titleOf(f.kinds, f.name), user)))];
    out.push({ name: p.name, version: p.version, license, used: pick && alts.length > 1 ? pick.join(' AND ') : null, notes, entries });
  }
  return out;
}

// ---------- 2. the Rust standard library ----------
const unhtml = (s) => s.replace(/<[^>]+>/g, '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
// Crates in Rust's notice that are never in a program: the test runner's and the compiler's own.
const STD_NOT_LINKED = new Set(['getopts', 'rustc-literal-escaper']);
function rustStd(sysroot) {
  const docs = join(sysroot, 'share', 'doc', 'rust'), html = read(join(docs, 'COPYRIGHT-library.html'));
  const inTree = html.slice(html.indexOf('id="in-tree-files"'), html.indexOf('id="out-of-tree-dependencies"'));
  // Rust's own files: path, license, copyright lines. An exception sits in a box inside the box of what it is an
  // exception to, and its path is written from there ("mod.rs" in library/core/src/unicode).
  const parts = [], open = [];
  for (const m of inTree.matchAll(/<div\b|<\/div>|<b>(File\/Directory|License|Copyright):<\/b>\s*([\s\S]*?)<\/p>/g)) {
    if (m[0] === '<div') { open.push(null); continue; }
    if (m[0] === '</div>') { open.pop(); continue; }
    const v = unhtml(m[2]).trim();
    if (m[1] === 'File/Directory') {
      const parent = open.slice(0, -1).filter(Boolean).at(-1)?.path;
      const path = !parent || parent === '.' || v.startsWith(parent + '/') ? v : parent + '/' + v;
      parts.push((open[open.length - 1] = { path, license: '', copyright: [] }));
    } else if (m[1] === 'License') parts.at(-1).license = v; else parts.at(-1).copyright.push(v);
  }
  if (!parts.length) throw new Error('COPYRIGHT-library.html: no in-tree files found');
  // the standard library's crates for this target: lib<name>-<hash>.rlib
  const libDir = join(sysroot, 'lib', 'rustlib', TARGET, 'lib');
  const rlibs = new Map(readdirSync(libDir).map((f) => /^lib(\w+)-[0-9a-f]+\.rlib$/.exec(f)).filter(Boolean).map((m) => [m[1].replace(/_/g, '-'), join(libDir, m[0])]));
  const blocks = html.split('<h3>📦 ').slice(1).map((b) => {
    const [, nv] = /^([^<]+)<\/h3>/.exec(b), at = nv.search(/-\d+\.\d/);
    return { name: nv.slice(0, at), version: nv.slice(at + 1), license: unhtml(/<b>License:<\/b>\s*([\s\S]*?)<\/p>/.exec(b)?.[1] || '').trim(),
      files: [...b.matchAll(/<summary><code>([^<]+)<\/code><\/summary>\s*<pre>([\s\S]*?)<\/pre>/g)].map((m) => { const text = unhtml(m[2]); return { name: m[1], text, kinds: kindsOf(text) }; }) };
  });
  const deps = [];
  for (const [name, rlib] of rlibs) {
    const cands = blocks.filter((b) => b.name.replace(/_/g, '-') === name);
    if (!cands.length || STD_NOT_LINKED.has(name)) continue;   // Rust's own crate (in-tree), or never linked
    // several versions in the notice (the tools use others): the one named inside the compiled crate
    const bin = readFileSync(rlib).toString('latin1');
    const b = cands.length === 1 ? cands[0] : cands.find((c) => bin.includes(c.name + '-' + c.version));
    if (!b) throw new Error('Rust standard library: which ' + name + ' is it? ' + cands.map((c) => c.version).join(', '));
    const alts = choices(b.license), ok = (g) => g.every((id) => b.files.some((f) => covers(f, id)));
    const pick = [...alts].sort((x, y) => (ok(y) - ok(x)) || x.reduce((n, id) => n + rank(id), 0) - y.reduce((n, id) => n + rank(id), 0))[0];
    if (!ok(pick)) throw new Error('Rust standard library: ' + name + ': no text for ' + pick.join(' AND '));
    const files = b.files.filter((f) => !f.kinds.size || pick.some((id) => covers(f, id)));
    deps.push({ name: b.name, version: b.version, license: b.license, used: alts.length > 1 ? pick.join(' AND ') : null,
      entries: [...new Set(files.map((f) => addText(f.text, titleOf(f.kinds, f.name), 'Rust standard library: ' + b.name + ' ' + b.version)))] });
  }
  // Rust's own code: Apache 2.0 where it offers MIT too (the standard text names no copyright holder), and the
  // other licenses its notice names, from the texts that come with Rust
  for (const x of parts) {
    const alts = choices(x.license).sort((a, b) => (a.includes('Apache-2.0') ? -1 : 0) - (b.includes('Apache-2.0') ? -1 : 0));
    x.pick = alts[0]; x.used = alts.length > 1 ? alts[0].join(' AND ') : null;
  }
  const ids = [...new Set(parts.flatMap((x) => x.pick.map(base)))];
  const own = ids.map((id) => { const f = join(docs, 'licenses', id + '.txt'); if (!existsSync(f)) throw new Error('Rust standard library: no text for ' + id); const text = read(f); return addText(text, titleOf(kindsOf(text), id), 'Rust standard library'); });
  return { parts, deps, own };
}

// ---------- 3 to 6: the rest of the app ----------
function others(crates) {
  const lic = (f) => read(join(ROOT, f));
  const one = (user, file, title) => { const text = lic(file); return addText(text, title || titleOf(kindsOf(text), file), user); };
  const wv = crates.find((c) => c.name === 'webview2-com-sys');
  return {
    webview2: wv ? { line: 'The WebView2 loader (WebView2LoaderStatic.lib, from Microsoft’s WebView2 SDK), linked into capewatch.exe by webview2-com-sys ' + wv.version + '. Copyright (C) Microsoft Corporation.', entry: one('Microsoft WebView2 loader', 'tools/licenses/webview2-sdk.txt', 'Microsoft WebView2 SDK License') } : null,
    js: [['skinview3d, the 3D figure', 'vendor/skinview3d/LICENSE-skinview3d.txt'], ['skinview-utils, part of skinview3d', 'vendor/skinview3d/LICENSE-skinview-utils.txt'], ['three.js, the 3D library skinview3d is built on', 'vendor/skinview3d/LICENSE-three.txt']]
      .map(([what, file]) => ({ line: what + ' (in vendor/skinview3d/skinview3d.bundle.js)', entry: one(what.split(',')[0], file) })),
    fonts: [['Assistant', 'assets/fonts/google/OFL-assistant.txt'], ['Pixelify Sans', 'assets/fonts/google/OFL-pixelify-sans.txt'], ['Secular One', 'assets/fonts/google/OFL-secular-one.txt']]
      .map(([name, file]) => ({ line: name + ' (font, from Google Fonts)', entry: one(name + ' font', file) })),
    installer: [{ line: 'NSIS (Nullsoft Scriptable Install System), which makes the installer and uninstall.exe', entry: one('NSIS', 'tools/licenses/nsis.txt', 'NSIS License (zlib/libpng, bzip2 and Common Public License 1.0)') },
      { line: 'Tauri’s NSIS plugin, nsis_tauri_utils (MIT OR Apache-2.0: MIT used), in the installer and uninstall.exe', entry: one('Tauri NSIS plugin', 'tools/licenses/nsis-tauri-utils.txt') }]
  };
}

// ---------- the file ----------
function wrap(text, width = 110, indent = '') {
  const out = []; let line = indent;
  for (const w of text.split(' ')) {
    if (line.trim() && (line + ' ' + w).length > width) { out.push(line); line = indent + w; } else line = line.trim() ? line + ' ' + w : indent + w;
  }
  if (line.trim()) out.push(line);
  return out.join('\n');
}
export function make() {
  const sysroot = execFileSync('rustc', ['--print', 'sysroot'], { encoding: 'utf8' }).trim();
  const crates = rustCrates(join(sysroot, 'share', 'doc', 'rust'));
  const std = rustStd(sysroot), rest = others(crates);
  // number the texts: by name, then by who uses them
  const list = [...pool.values()].sort((a, b) => a.title.localeCompare(b.title, 'en') || a.users[0].localeCompare(b.users[0], 'en'));
  list.forEach((e, i) => { e.n = i + 1; });
  const refs = (entries) => entries.map((e) => '[' + e.n + ']').join(' ');
  const H = (n, title) => n + '. ' + title + '\n' + '-'.repeat(n.length + 2 + title.length);
  const rust = rustVersion();
  const doc = [
    'CapeWatch: the software by other people inside it, and its licenses',
    '=====================================================================',
    '',
    wrap('CapeWatch is made by Kayoiz. It is built with software that other people wrote and share under the licenses below. This file names every piece of it that is part of CapeWatch for Windows (the program, capewatch.exe, and its installer and uninstaller) and gives each one’s license text, as those licenses ask. A number in brackets, like [1], leads to a license text in part 7.'),
    '',
    wrap('Made by tools/make-licenses.mjs from app/src-tauri/Cargo.lock and Rust ' + rust + ' (inputs ' + inputsHash() + '). Not edited by hand.'),
    '',
    'Contents',
    '  1. Rust crates compiled into capewatch.exe (' + crates.length + ')',
    '  2. The Rust standard library',
    '  3. Microsoft WebView2',
    '  4. JavaScript libraries',
    '  5. Fonts',
    '  6. The installer and uninstaller',
    '  7. License texts ([1] to [' + list.length + '])',
    '',
    '',
    H('1', 'Rust crates compiled into capewatch.exe'),
    wrap('Each crate with its version and license. Where a crate offers a choice, the one used follows in brackets. From crates.io: https://crates.io/crates/<name>/<version>.'),
    '',
    ...crates.map((c) => c.name + ' ' + c.version + ' — ' + c.license + (c.used ? ' (' + c.used + ')' : '') + (c.notes.length ? ' — ' + c.notes.join('; ') : '') + ' — ' + refs(c.entries)),
    '',
    '',
    H('2', 'The Rust standard library'),
    wrap('Every program written in Rust carries parts of Rust’s standard library. capewatch.exe was built with Rust ' + rust + '. From Rust’s own notice (COPYRIGHT-library.html, which comes with Rust), for the parts of the standard library a Windows program uses:'),
    '',
    'Rust’s own code — texts ' + refs(std.own) + ':',
    ...std.parts.map((x) => '  ' + (x.path === '.' ? 'everything not named below' : x.path) + ' — ' + x.license + (x.used ? ' (' + x.used + ')' : '') + ' — Copyright: ' + x.copyright.join('; ')),
    '',
    'Crates from outside the Rust project that the standard library is built with:',
    ...std.deps.map((d) => '  ' + d.name + ' ' + d.version + ' — ' + d.license + (d.used ? ' (' + d.used + ')' : '') + ' — ' + refs(d.entries)),
    '',
    '',
    H('3', 'Microsoft WebView2'),
    ...(rest.webview2 ? [wrap(rest.webview2.line + ' — ' + refs([rest.webview2.entry]))] : ['Not used.']),
    wrap('The WebView2 Runtime that shows CapeWatch’s window is part of Windows and is not shipped with CapeWatch.'),
    '',
    '',
    H('4', 'JavaScript libraries'),
    ...rest.js.map((x) => x.line + ' — MIT — ' + refs([x.entry])),
    '',
    '',
    H('5', 'Fonts'),
    ...rest.fonts.map((x) => x.line + ' — OFL-1.1 — ' + refs([x.entry])),
    'CapeWatch Pixel, the pixel font of the cape names and numbers, and the app’s icons are CapeWatch’s own.',
    '',
    '',
    H('6', 'The installer and uninstaller'),
    ...rest.installer.map((x) => wrap(x.line + ' — ' + refs([x.entry]))),
    '',
    '',
    H('7', 'License texts'),
    '',
    ...list.flatMap((e) => [
      '[' + e.n + '] ' + e.title,
      wrap('Used by: ' + e.users.join(', '), 110, '    '),
      '-'.repeat(80),
      e.text,
      '',
      ''
    ])
  ].join('\n').replace(/\n+$/, '\n');
  return { doc, crates, std, texts: list.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { doc, crates, std, texts } = make();
  writeFileSync(OUT, doc);
  console.log('THIRD-PARTY-NOTICES.txt: ' + crates.length + ' crates, the Rust standard library (' + std.deps.map((d) => d.name).join(', ') + '), ' + texts + ' license texts, ' + Math.round(doc.length / 1024) + ' KB');
}
