// All CapeWatch tests in one command:   node tests/run.mjs      (or: npm test, from the project folder)
// 1. builds the app page (app/dist), the same way the app build does;
// 2. runs every *.test.mjs under tests/: the shell's rules in Node (unit), the robot with saved sample files
//    (robot), and the real page in headless Microsoft Edge (browser; skipped if Edge is missing).
// Nothing here touches the network except the browser tests' fonts; the data always comes from the tests.
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..');
const only = process.argv.slice(2);   // e.g. `node tests/run.mjs unit robot` runs only those folders

execFileSync(process.execPath, [join(root, 'app', 'build-web.mjs')], { stdio: 'ignore' });
console.log('page built: app/dist');

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['lib', 'fixtures'].includes(e.name)) walk(p); }
    else if (e.name.endsWith('.test.mjs')) files.push(p);
  }
})(here);
const picked = files.filter((f) => !only.length || only.some((o) => relative(here, f).startsWith(o))).sort();
console.log('running ' + picked.length + ' test files\n');
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...picked], { stdio: 'inherit', cwd: root });
process.exit(r.status ?? 1);
