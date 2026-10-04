// Builds app/dist from the same page the dashboard uses: cape-radar.html plus the app shell script.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dist = join(here, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const page = readFileSync(join(root, 'cape-radar.html'), 'utf8');
const html = '<!doctype html>\n<html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<script src="shell.js"></script></head>\n<body>\n' + page + '\n</body></html>\n';
writeFileSync(join(dist, 'index.html'), html);
cpSync(join(here, 'shell.js'), join(dist, 'shell.js'));
cpSync(join(root, 'assets', 'title-fx.js'), join(dist, 'assets', 'title-fx.js'));
cpSync(join(root, 'vendor'), join(dist, 'vendor'), { recursive: true });
cpSync(join(root, 'assets', 'skin'), join(dist, 'assets', 'skin'), { recursive: true });
cpSync(join(root, 'assets', 'fonts'), join(dist, 'assets', 'fonts'), { recursive: true });
cpSync(join(root, 'assets', 'brand'), join(dist, 'assets', 'brand'), { recursive: true, filter: (src) => !/\.(jpe?g)$/i.test(src) });   // the title art only (not the README banner)
console.log('dist ready:', dist);
