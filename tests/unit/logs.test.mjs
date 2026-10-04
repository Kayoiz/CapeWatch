// Task 6: what goes into the app's log file. Routine lines stay out (the file covers weeks, not hours);
// everything useful for finding a problem goes in. (The size limit itself is in main.rs: at 1 MB the file is
// renamed with the date, and only the 2 newest old files are kept. Checked on the installed test copy.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, makeStorage, dataServer, sampleData } from '../lib/shell-sandbox.mjs';

test('routine figure lines stay out of the log file, errors and events go in', async () => {
  const s = await loadShell({ storage: makeStorage(), fetch: dataServer({ data: sampleData() }) });
  const c = s.ctx.console;
  s.out.file.length = 0;
  c.info('[Cape3D]', 'swap:', 'a cape -> a elytra');
  c.info('[Cape3D]', 'cape: loading', 'x', 'https://textures.minecraft.net/texture/x');
  c.info('[Cape3D]', 'cape: loaded', 'x', 'in', '3ms');
  c.info('[Cape3D]', 'fps', '59.8');
  c.info('[Cape3D]', 'fps', '12.4');                    // slow: worth keeping
  c.info('[Cape3D]', 'view: paused (window hidden or minimized)');
  c.error('[Cape3D]', 'cape: failed', 'x', 'https://textures.minecraft.net/texture/x', 'error');
  c.info('[Title]', 'glow: start');
  c.info('[Sound]', 'holy chord: running');
  c.info('something else entirely');                    // not one of the page's tagged lines
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(s.out.file, [
    '[Cape3D] fps 12.4',
    '[Cape3D] view: paused (window hidden or minimized)',
    '[Cape3D] cape: failed x https://textures.minecraft.net/texture/x error',
    '[Title] glow: start',
    '[Sound] holy chord: running'
  ]);
});

test('the shell’s own lines (data, notifications, settings) always go in', async () => {
  const s = await loadShell({ storage: makeStorage(), fetch: dataServer({ data: sampleData() }) });
  assert.ok(s.out.file.some((l) => /^\[App\] data: loaded/.test(l)));
  assert.ok(s.out.file.some((l) => /^\[App\] notify: first run/.test(l)));
  assert.ok(s.out.file.some((l) => /^\[App\] start: app shell ready/.test(l)));
});
