// Finds everything on the page that sticks out of the window or out of its own box (text cut off or
// overflowing). Run it inside the page: page.eval(FIND_PROBLEMS) returns a list of problems (empty = fine).
export const FIND_PROBLEMS = `(() => {
  const out = [], W = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > W + 1) out.push('page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + W);
  const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '') + ' "' + (e.textContent || '').trim().slice(0, 40) + '"';
  const sel = '.btn, button, .pill, .ed, .flag, .stat b, .stat span, label, select, .live-name, .countdown, .tile-name, h1, h2, h3, .unofficial span, .eyebrow, .lede, footer p, .facts dt, .facts dd, .cw-set legend, .cw-opt span, .count-line, .log time, .log li > span';
  for (const e of document.querySelectorAll(sel)) {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden') continue;
    if (e.closest('dialog') && !e.closest('dialog').open) continue;
    if (r.right > W + 1 || r.left < -1) out.push('outside the window: ' + name(e) + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
    if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0) out.push((getComputedStyle(e).overflowX === 'visible' ? 'text sticks out: ' : 'text cut off: ') + name(e));
    const p = e.parentElement?.getBoundingClientRect();
    if (p && p.width && (r.right > p.right + 1 || r.left < p.left - 1)) out.push('sticks out of its box: ' + name(e) + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ' in ' + Math.round(p.left) + '..' + Math.round(p.right) + ']');
  }
  for (const d of document.querySelectorAll('dialog[open]')) {
    const r = d.getBoundingClientRect();
    if (r.right > W + 1 || r.left < -1) out.push('dialog wider than the window: ' + d.id);
    if (d.scrollWidth > d.clientWidth + 1) out.push('dialog scrolls sideways: ' + d.id);
  }
  return out;
})()`;
