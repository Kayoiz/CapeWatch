// CapeWatch title effects: the opening glow of the title art (with timeline, keyframes, glow area and blocks)
// and the opening sound ("holy" chord).
// One copy of the code, used by the app page (cape-radar.html) and by the developer tuning page
// (tools/tune-title.html). The defaults below are what the app uses.
(function () {
  'use strict';

  // ---------- defaults (tuned by the owner in tools/tune-title.html, 2026-10-03) ----------
  const GLOW = {
    intensity: 1.1,      // how bright the title gets at the peak (1 = +55% brightness, +25% saturation)
    halo: 0.8,           // halo size; 1 = 10px inner + 26px outer glow at the title's full width (640px)
    color: '#00ffaa',    // halo colour (the outer glow is a darker shade of it)
    rise: 0.8,           // seconds to the peak
    hold: 0.54,          // seconds at the peak
    fade: 2.2            // seconds back to normal
  };
  const SOUND = {
    volume: 0.77,        // 0..1.5
    pitch: 0,            // semitones up/down
    length: 1,           // 1 = about 2 s of chord (the echo carries on after it)
    echo: 1.2,           // amount of echo (reverb) 0..1.2
    chord: 'Am9'         // one of CHORDS
  };
  const CHORDS = {
    Dadd9: { label: 'D major add9 (bright, open)', hz: [146.83, 220.0, 293.66, 369.99, 440.0, 659.25] },
    Cmaj: { label: 'C major (plain, warm)', hz: [130.81, 196.0, 261.63, 329.63, 392.0, 523.25] },
    Fmaj7: { label: 'F major 7 (dreamy)', hz: [174.61, 261.63, 349.23, 440.0, 523.25, 659.25] },
    Esus2: { label: 'E sus2 (airy, unresolved)', hz: [164.81, 246.94, 329.63, 369.99, 493.88, 739.99] },
    Am9: { label: 'A minor 9 (dark, mysterious)', hz: [110.0, 164.81, 220.0, 261.63, 329.63, 493.88] }
  };

  // ---------- glow ----------
  const ease = (u) => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const total = (o) => o.rise + o.hold + o.fade;
  // 0..1 strength of the glow at time t (seconds)
  function strength(t, o = GLOW) {
    if (t < 0) return 0;
    if (t < o.rise) return 1 - Math.pow(1 - t / Math.max(o.rise, 1e-3), 3);   // quick, soft rise
    if (t < o.rise + o.hold) return 1;
    return Math.max(0, 1 - ease((t - o.rise - o.hold) / Math.max(o.fade, 1e-3)));
  }
  const rgb = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  // The outer glow: the same hue, a little darker and less saturated (#82ffaa gives about rgb(80, 230, 140)).
  function outerShade(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    let h = 0, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const l2 = Math.max(0, l - 0.147), s2 = s * 0.76;
    const c = (1 - Math.abs(2 * l2 - 1)) * s2, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l2 - c / 2;
    const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [r1, g1, b1].map((v) => Math.round((v + m) * 255));
  }
  // CSS filter for strength g; scale = displayed title width / 640
  function filter(g, scale, o = GLOW) {
    if (g <= 0.001) return '';
    const [r, gr, b] = rgb(o.color), [r2, g2, b2] = outerShade(r, gr, b);
    const a = Math.min(1, o.intensity) * g;
    return `brightness(${(1 + 0.55 * o.intensity * g).toFixed(3)}) saturate(${(1 + 0.25 * o.intensity * g).toFixed(3)})`
      + ` drop-shadow(0 0 ${(10 * o.halo * scale * g).toFixed(1)}px rgba(${r}, ${gr}, ${b}, ${(0.85 * a).toFixed(3)}))`
      + ` drop-shadow(0 0 ${(26 * o.halo * scale * g).toFixed(1)}px rgba(${r2}, ${g2}, ${b2}, ${(0.55 * a).toFixed(3)}))`;
  }
  // Plays the glow on an <img>; returns a stop() function. onDone(stats) when it ends by itself.
  function runGlow(img, o = GLOW, onDone) {
    let stopped = false, t0 = 0, last = 0, frames = 0, worst = 0;
    const scale = () => (img.clientWidth || 640) / 640;
    const tick = (now) => {
      if (stopped) return;
      if (!t0) t0 = last = now;
      worst = Math.max(worst, now - last); last = now; frames++;
      const t = (now - t0) / 1000;
      if (t >= total(o)) { img.style.filter = ''; onDone && onDone({ frames, ms: now - t0, worst }); return; }
      img.style.filter = filter(strength(t, o), scale(), o);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { stopped = true; img.style.filter = ''; };
  }

  // ---------- sound ----------
  // A short "holy" chord, synthesised here: a soft choir "aah" (detuned saw voices through vowel formant filters,
  // with a slow vibrato), a high airy shimmer, and an echo from a generated reverb. No sound file is used.
  // The audio context and the echo (a generated impulse response: stereo noise fading out) are made once and
  // kept: building them takes a moment, so prepareSound() does it before the effect starts and every play reuses it.
  let prepared = null;
  function audioFor(o) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const irSec = 1.2 + 1.6 * Math.min(1.2, Math.max(0, o.echo));
    if (prepared && prepared.ac.state !== 'closed' && prepared.irSec === irSec) return prepared;
    const ac = prepared && prepared.ac.state !== 'closed' ? prepared.ac : new AC();
    const len = Math.floor(ac.sampleRate * irSec), ir = ac.createBuffer(2, len, ac.sampleRate);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = rnd() * Math.pow(1 - i / len, 3.2); }
    if (prepared && prepared.wet) prepared.wet.disconnect();
    const verb = ac.createConvolver(); verb.buffer = ir;
    const wet = ac.createGain(); verb.connect(wet).connect(ac.destination);
    return (prepared = { ac, irSec, verb, wet });
  }
  function prepareSound(o = SOUND) { try { return !!audioFor(o); } catch { return false; } }
  function holyChord(o = SOUND) {
    const A = audioFor(o);
    if (!A) return 'no Web Audio';
    const { ac, verb, wet } = A, t0 = ac.currentTime + 0.03, L = Math.max(0.3, o.length);
    const shift = Math.pow(2, o.pitch / 12);
    // volume -> dry (0.5) and -> the shared echo (wet = echo amount)
    wet.gain.setValueAtTime(o.echo, ac.currentTime);
    const vol = ac.createGain(); vol.gain.value = o.volume;
    const dryOut = ac.createGain(); dryOut.gain.value = 0.5; vol.connect(dryOut).connect(ac.destination); vol.connect(verb);
    const choir = ac.createGain(), env = choir.gain;
    env.setValueAtTime(0, t0);
    env.linearRampToValueAtTime(0.11, t0 + 0.35 * L);              // soft attack
    env.setValueAtTime(0.11, t0 + 0.75 * L);
    env.exponentialRampToValueAtTime(0.0008, t0 + 1.9 * L);       // release; the echo carries on
    for (const [f, q, gain] of [[800, 6, 1], [1150, 8, 0.5], [2900, 10, 0.18]]) {   // "aah" vowel formants
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = ac.createGain(); g.gain.value = gain;
      choir.connect(bp).connect(g); g.connect(vol);   // vol feeds the dry path and the echo
    }
    const vib = ac.createOscillator(); vib.frequency.value = 5.2;
    const vibDepth = ac.createGain(); vibDepth.gain.value = 5;      // cents
    vib.connect(vibDepth);
    const oscs = [vib], notes = (CHORDS[o.chord] || CHORDS.Dadd9).hz;
    notes.forEach((hz, n) => {
      for (const cents of [-7, 0, 7]) {
        const osc = ac.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = hz * shift; osc.detune.value = cents + (n % 2 ? 2 : -2);
        vibDepth.connect(osc.detune);
        const g = ac.createGain(); g.gain.value = n === 0 ? 0.55 : 0.35;
        osc.connect(g).connect(choir); oscs.push(osc);
      }
    });
    const shim = ac.createGain();                                   // shimmer: two soft high sines, a bit later
    shim.gain.setValueAtTime(0, t0); shim.gain.linearRampToValueAtTime(0.035, t0 + 0.5 * L); shim.gain.exponentialRampToValueAtTime(0.0005, t0 + 1.9 * L);
    shim.connect(vol);
    for (const hz of [notes[2] * 4, notes[4] * 4]) { const osc = ac.createOscillator(); osc.type = 'sine'; osc.frequency.value = hz * shift; osc.connect(shim); oscs.push(osc); }
    oscs.forEach((osc) => { osc.start(t0); osc.stop(t0 + 2.0 * L); });
    const state = ac.state;
    if (state !== 'running') ac.resume().catch(() => {});
    setTimeout(() => { try { vol.disconnect(); } catch {} }, (2.0 * L + A.irSec + 0.5) * 1000);   // after the echo has died away
    return state;
  }

  // =====================================================================================================
  // Title renderer: timeline, keyframes, glow area (whole title / letter edges / red eyes), blocks, shadows,
  // light sweep, eye flicker and blink, particles, sound timing. The app plays SCENE as is (tools/tune-title.html
  // edits a copy live). Everything is drawn on a canvas laid over the title image while it plays; when it ends
  // the plain image is shown again, so every effect must be back at rest by the end of the timeline.
  // =====================================================================================================
  const SCENE = {
    duration: 3.6,                                  // timeline length, seconds
    glow: Object.assign(GLOW, {
      on: true,
      start: 0,                                     // seconds on the timeline
      area: 'all',                                  // 'all' | 'edges' | 'eyes'
      edgeThreshold: 200,                           // edges: alpha that counts as the solid letter (0..255)
      edgeWidth: 2,                                 // edges: band width, px at the title's full width
      eyeMinRed: 150,                               // eye mask: minimum red (0..255)
      eyeDominance: 1.8                             // eye mask: red must be this many times green and blue
    }),
    keyframes: { on: false, list: [] },             // [{ t, scale, x, y, rot, opacity, brightness, blur, ease }]
    blocks: {
      on: false,
      mode: 'assemble',                             // 'assemble' (blocks fly in) | 'disassemble' (fly apart)
      size: 16,                                     // block size, px at the title's full width (640)
      spread: 160,                                  // how far the blocks travel, px at full width
      direction: 'center',                          // 'center' | 'random' | 'top'
      rotation: 120,                                // max spin of a block, degrees
      start: 0, duration: 1.0, stagger: 0.6,        // seconds; stagger = spread of start times
      ease: 'easeOut', fade: true, seed: 1
    },
    shadow: {                                       // a soft drop shadow, with its own fade in/out
      on: false, x: 6, y: 8, blur: 10, color: '#000000', opacity: 0.8,
      start: 0, rise: 0.4, hold: 1.5, fade: 0.8
    },
    longShadow: {                                   // a long flat shadow cast in one direction
      on: false, angle: 45, length: 40, color: '#04140c', opacity: 0.7,
      start: 0, rise: 0.4, hold: 1.5, fade: 0.8
    },
    sweep: {                                        // a band of light passing over the letters
      on: false, angle: 20, width: 60, color: '#ffffff', opacity: 0.75,
      start: 0.6, time: 0.9, repeat: 1, gap: 0.6    // time = one pass, seconds; gap between passes
    },
    eyes: {                                         // the red eyes on their own
      on: false, mode: 'blink',                     // 'blink' | 'flicker'
      start: 1.2, count: 2, interval: 0.35,         // when, how many times, seconds between them
      time: 0.22,                                   // one blink / flicker, seconds
      dim: 0.95                                     // how dark the eyes get (0..1)
    },
    particles: {                                    // sparks or dust rising from the letters
      on: false, kind: 'sparks',                    // 'sparks' | 'dust'
      start: 0.3, emit: 1.5,                        // emitting from `start` for `emit` seconds
      rate: 60, speed: 60, size: 2.5, life: 1.2,    // per second, px/s, px (at full width), seconds
      color: '#7dffc4', from: 'edges', seed: 3      // from: 'edges' | 'all' (where they are born)
    },
    sound: Object.assign(SOUND, { on: true, start: 0 })   // start: seconds on the timeline
  };

  const EASE = {
    linear: (u) => u,
    easeIn: (u) => u * u * u,
    easeOut: (u) => 1 - Math.pow(1 - u, 3),
    easeInOut: ease,
    step: (u) => (u < 1 ? 0 : 1),
    back: (u) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); },
    bounce: (u) => {
      const n = 7.5625, d = 2.75;
      if (u < 1 / d) return n * u * u;
      if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75;
      if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375;
      return n * (u -= 2.625 / d) * u + 0.984375;
    },
    elastic: (u) => (u === 0 || u === 1 ? u : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * (2 * Math.PI / 3)) + 1)
  };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const envelope = (t, o) => strength(t - o.start, o);   // rise / hold / fade, like the glow

  // Copies values (e.g. pasted from the tuning page) into a scene, part by part.
  function applyValues(scene, v) {
    if (!v) return scene;
    if (typeof v.duration === 'number') scene.duration = v.duration;
    for (const [k, part] of Object.entries(v)) {
      if (!part || typeof part !== 'object' || !scene[k]) continue;
      if (k === 'keyframes') { scene.keyframes.on = !!part.on; scene.keyframes.list = (part.list || []).map((x) => ({ ...x })); }
      else Object.assign(scene[k], part);
    }
    return scene;
  }

  // ---------- keyframes ----------
  const KF_REST = { scale: 1, x: 0, y: 0, rot: 0, opacity: 1, brightness: 1, blur: 0 };
  const KF_PROPS = Object.keys(KF_REST);
  function keyframeAt(kf, t) {
    if (!kf || !kf.on || !kf.list.length) return KF_REST;
    const list = [...kf.list].sort((a, b) => a.t - b.t);
    const pick = (k) => Object.fromEntries(KF_PROPS.map((p) => [p, k[p] ?? KF_REST[p]]));
    if (t <= list[0].t) return pick(list[0]);
    const last = list[list.length - 1];
    if (t >= last.t) return pick(last);
    let i = 0; while (list[i + 1].t <= t) i++;
    const a = list[i], b = list[i + 1], e = (EASE[a.ease] || EASE.linear)(clamp01((t - a.t) / Math.max(1e-6, b.t - a.t)));
    return Object.fromEntries(KF_PROPS.map((p) => { const va = a[p] ?? KF_REST[p], vb = b[p] ?? KF_REST[p]; return [p, va + (vb - va) * e]; }));
  }

  // ---------- masks (computed from the image's own pixels) ----------
  function eyeMask(px, n, o) {
    const m = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3];
      m[i] = a > 128 && r >= o.eyeMinRed && r >= o.eyeDominance * g && r >= o.eyeDominance * b ? 1 : 0;
    }
    return m;
  }
  // edges: the solid part of the letters (alpha >= threshold) minus itself shrunk by `w` px
  function edgeMask(px, W, H, threshold, w) {
    const n = W * H, solid = new Uint8Array(n), tmp = new Uint8Array(n), er = new Uint8Array(n), m = new Uint8Array(n);
    for (let i = 0; i < n; i++) solid[i] = px[i * 4 + 3] >= threshold ? 1 : 0;
    for (let y = 0; y < H; y++) {
      let c = 0; const row = y * W;
      for (let x = 0; x < Math.min(W, w); x++) c += solid[row + x];
      for (let x = 0; x < W; x++) {
        if (x + w < W) c += solid[row + x + w];
        if (x - w - 1 >= 0) c -= solid[row + x - w - 1];
        tmp[row + x] = c === Math.min(W - 1, x + w) - Math.max(0, x - w) + 1 ? 1 : 0;
      }
    }
    for (let x = 0; x < W; x++) {
      let c = 0;
      for (let y = 0; y < Math.min(H, w); y++) c += tmp[y * W + x];
      for (let y = 0; y < H; y++) {
        if (y + w < H) c += tmp[(y + w) * W + x];
        if (y - w - 1 >= 0) c -= tmp[(y - w - 1) * W + x];
        er[y * W + x] = c === Math.min(H - 1, y + w) - Math.max(0, y - w) + 1 ? 1 : 0;
      }
    }
    for (let i = 0; i < n; i++) m[i] = solid[i] && !er[i] ? 1 : 0;
    return m;
  }
  // separate eyes: bounding boxes of connected groups of mask pixels (small specks dropped)
  function blobs(mask, W, H, minPx) {
    const seen = new Uint8Array(W * H), out = [], stack = [];
    for (let i = 0; i < W * H; i++) {
      if (!mask[i] || seen[i]) continue;
      let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
      stack.push(i); seen[i] = 1;
      while (stack.length) {
        const j = stack.pop(), x = j % W, y = (j / W) | 0; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < W * H && mask[k] && !seen[k] && Math.abs((k % W) - x) <= 1) { seen[k] = 1; stack.push(k); }
      }
      if (n >= minPx) out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
    return out;
  }
  const canvasOf = (W, H) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(W)); c.height = Math.max(1, Math.round(H)); return c; };
  function maskCanvas(mask, W, H, rgbArr) {
    const c = canvasOf(W, H), ctx = c.getContext('2d'), out = ctx.createImageData(W, H), d = out.data;
    for (let i = 0; i < W * H; i++) if (mask[i]) { d[i * 4] = rgbArr[0]; d[i * 4 + 1] = rgbArr[1]; d[i * 4 + 2] = rgbArr[2]; d[i * 4 + 3] = 255; }
    ctx.putImageData(out, 0, 0);
    return c;
  }
  // `src` cut to the mask (keeps src's colours)
  function cutTo(src, maskCv) {
    const c = canvasOf(src.width, src.height), x = c.getContext('2d');
    x.drawImage(src, 0, 0); x.globalCompositeOperation = 'destination-in'; x.drawImage(maskCv, 0, 0);
    return c;
  }

  // ---------- blocks ----------
  function makeBlocks(px, W, H, b, scale) {
    const size = Math.max(2, Math.round(b.size * scale)), list = [];
    let seed = (b.seed | 0) * 9301 + 49297;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const cx0 = W / 2, cy0 = H / 2, maxD = Math.hypot(cx0, cy0);
    for (let sy = 0; sy < H; sy += size) for (let sx = 0; sx < W; sx += size) {
      const sw = Math.min(size, W - sx), sh = Math.min(size, H - sy);
      let any = false;
      for (let y = sy; y < sy + sh && !any; y += 2) for (let x = sx; x < sx + sw; x += 2) if (px[(y * W + x) * 4 + 3] > 16) { any = true; break; }
      if (!any) continue;
      const cx = sx + sw / 2, cy = sy + sh / 2, r1 = rnd(), r2 = rnd(), r3 = rnd();
      const dist = b.spread * scale * (0.55 + 0.45 * r1);
      let dx, dy, order;
      if (b.direction === 'random') { const a = r2 * Math.PI * 2; dx = Math.cos(a) * dist; dy = Math.sin(a) * dist; order = r3; }
      else if (b.direction === 'top') { dx = (r2 - 0.5) * dist * 0.3; dy = -dist - sy; order = (cx / W) * 0.7 + r3 * 0.3; }
      else { const a = Math.atan2(cy - cy0, cx - cx0); dx = Math.cos(a) * dist; dy = Math.sin(a) * dist; order = Math.hypot(cx - cx0, cy - cy0) / maxD; }
      list.push({ sx, sy, sw, sh, cx, cy, dx, dy, rot: (r3 * 2 - 1) * b.rotation * Math.PI / 180, order });
    }
    return list;
  }
  function blockState(b, blk, t) {
    const p = clamp01((t - b.start - blk.order * b.stagger) / Math.max(0.01, b.duration));
    const e = (EASE[b.ease] || EASE.easeOut)(p);
    return b.mode === 'disassemble' ? { k: e, a: b.fade ? 1 - p : 1 } : { k: 1 - e, a: b.fade ? p : 1 };
  }
  const blocksEnd = (b) => b.start + b.stagger + b.duration;
  const blocksAtRest = (b, t) => !b.on || (b.mode === 'assemble' ? t >= blocksEnd(b) : false);

  // ---------- eyes, sweep, particles: timing ----------
  // 0..1 how closed / dimmed the eyes are at time t
  function eyeAmount(e, t) {
    if (!e.on) return 0;
    for (let i = 0; i < e.count; i++) {
      const s = e.start + i * (e.time + e.interval), u = (t - s) / Math.max(0.02, e.time);
      if (u < 0 || u > 1) continue;
      if (e.mode === 'flicker') return e.dim * (0.5 + 0.5 * Math.sin(u * Math.PI * 6)) * Math.sin(u * Math.PI);
      return e.dim * Math.sin(u * Math.PI);   // close and open again
    }
    return 0;
  }
  const eyesEnd = (e) => e.start + e.count * (e.time + e.interval);
  // 0..1 position of the sweep band (null when no pass is running)
  function sweepPos(s, t) {
    if (!s.on) return null;
    for (let i = 0; i < Math.max(1, s.repeat); i++) {
      const a = s.start + i * (s.time + s.gap), u = (t - a) / Math.max(0.05, s.time);
      if (u >= 0 && u <= 1) return u;
    }
    return null;
  }
  const sweepEnd = (s) => s.start + Math.max(1, s.repeat) * (s.time + s.gap);
  const particlesEnd = (p) => p.start + p.emit + p.life;

  // ---------- the renderer ----------
  // createTitleFx(img, scene, { fixed }): an overlay canvas over `img`. With fixed: true (the app) the overlay is
  // position: fixed, so blocks flying past the window edge never add scrollbars; otherwise the img's parent must
  // be position: relative. renderAt(t) draws one moment; play() runs the timeline; show(false) hides the overlay.
  function createTitleFx(img, scene = SCENE, opts = {}) {
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = `position:${opts.fixed ? 'fixed' : 'absolute'};pointer-events:none;z-index:${opts.fixed ? 50 : 2};display:none`;
    (opts.fixed ? document.body : img.parentElement).append(cv);
    const out = cv.getContext('2d');
    let L = null, cacheKey = '', raf = 0, playing = false;

    function margin(sc) {
      let m = 30 * (scene.glow.halo || 1) * sc + 8;
      if (scene.blocks.on) m += scene.blocks.spread * sc * 1.15 + scene.blocks.size * sc;
      if (scene.keyframes.on) for (const k of scene.keyframes.list) m = Math.max(m, (Math.abs(k.x || 0) + Math.abs(k.y || 0)) * sc + 40 * sc + Math.max(0, (k.scale ?? 1) - 1) * img.clientWidth / 2 + (k.blur || 0) * 3);
      if (scene.shadow.on) m = Math.max(m, (Math.abs(scene.shadow.x) + Math.abs(scene.shadow.y) + scene.shadow.blur * 2) * sc + 8);
      if (scene.longShadow.on) m = Math.max(m, scene.longShadow.length * sc + 8);
      if (scene.particles.on) m = Math.max(m, scene.particles.speed * scene.particles.life * sc * 1.3 + 10);
      return Math.min(Math.ceil(m), 900);
    }
    // Static layers at device resolution, rebuilt only when the size or a setting they depend on changes.
    function layers() {
      const w = img.clientWidth, h = img.clientHeight;
      if (!w || !h || !img.naturalWidth) return null;
      const dpr = window.devicePixelRatio || 1, sc = w / 640, g = scene.glow, b = scene.blocks, p = scene.particles;
      const W = Math.round(w * dpr), H = Math.round(h * dpr), M = margin(sc), Md = Math.round(M * dpr);
      const key = [W, H, Md, img.currentSrc, g.area, g.edgeThreshold, g.edgeWidth, g.eyeMinRed, g.eyeDominance, g.color, g.intensity,
        b.on, b.size, b.spread, b.direction, b.rotation, b.seed, p.on, p.from, p.seed, scene.eyes.on, scene.sweep.on].join('|');
      if (L && key === cacheKey) return L;
      cacheKey = key;
      const base = canvasOf(W, H), bc = base.getContext('2d', { willReadFrequently: true });
      bc.drawImage(img, 0, 0, W, H);
      const data = bc.getImageData(0, 0, W, H), px = data.data, n = W * H;
      const needEyes = g.area === 'eyes' || scene.eyes.on;
      const eyes = needEyes ? eyeMask(px, n, g) : null;
      const edges = g.area === 'edges' || (p.on && p.from === 'edges') ? edgeMask(px, W, H, g.edgeThreshold, Math.max(1, Math.round(g.edgeWidth * sc * dpr))) : null;
      const area = g.area === 'eyes' ? eyes : g.area === 'edges' ? edges : null;
      const white = [255, 255, 255];
      const areaCv = area ? maskCanvas(area, W, H, white) : null;
      const eyeCv = eyes ? maskCanvas(eyes, W, H, white) : null;
      // the lit look of the glowing area (crossfaded in by the glow's strength) when the glow is not on everything
      let bright = null;
      if (areaCv) {
        bright = canvasOf(W, H); const brc = bright.getContext('2d');
        brc.filter = `brightness(${1 + 0.55 * g.intensity}) saturate(${1 + 0.25 * g.intensity})`; brc.drawImage(base, 0, 0); brc.filter = 'none';
        brc.globalCompositeOperation = 'destination-in'; brc.drawImage(areaCv, 0, 0);
      }
      // birth points for particles: a fixed sample of letter (or edge) pixels
      let births = null;
      if (p.on) {
        births = []; let seed = (p.seed | 0) * 7919 + 13;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        const src = p.from === 'edges' && edges ? edges : null;
        for (let tries = 0; births.length < 600 && tries < 200000; tries++) {
          const i = Math.floor(rnd() * n);
          if (src ? src[i] : px[i * 4 + 3] > 200) births.push([i % W, (i / W) | 0]);
        }
      }
      const big = (f = 1) => canvasOf((W + 2 * Md) * f, (H + 2 * Md) * f);
      L = { w, h, dpr, sc, W, H, M, Md, base, bright, areaCv, eyeCv,
        eyeLook: eyeCv ? cutTo(base, eyeCv) : null, eyeBlobs: eyes ? blobs(eyes, W, H, Math.max(4, Math.round(6 * sc * dpr))) : [],
        births, frame: canvasOf(W, H), comp: big(), tmp: big(), half: big(0.5), half2: big(0.5),
        blocks: b.on ? makeBlocks(px, W, H, b, sc * dpr) : null };
      cv.width = W + 2 * Md; cv.height = H + 2 * Md;
      cv.style.width = (w + 2 * M) + 'px'; cv.style.height = (h + 2 * M) + 'px';
      return L;
    }
    function place() {
      const l = L;
      if (opts.fixed) { const r = img.getBoundingClientRect(); cv.style.left = (r.left - l.M) + 'px'; cv.style.top = (r.top - l.M) + 'px'; }
      else { cv.style.left = (img.offsetLeft - l.M) + 'px'; cv.style.top = (img.offsetTop - l.M) + 'px'; }
    }
    // draws a W×H layer into a big canvas, as blocks when they are flying
    function drawLayer(ctx, layer, t, alpha) {
      const l = L, b = scene.blocks;
      ctx.globalAlpha = alpha;
      if (!l.blocks || blocksAtRest(b, t)) { ctx.drawImage(layer, l.Md, l.Md); ctx.globalAlpha = 1; return; }
      for (const blk of l.blocks) {
        const { k, a } = blockState(b, blk, t);
        if (a <= 0.002) continue;
        ctx.globalAlpha = alpha * a;
        if (k < 1e-4) { ctx.drawImage(layer, blk.sx, blk.sy, blk.sw, blk.sh, l.Md + blk.sx, l.Md + blk.sy, blk.sw, blk.sh); continue; }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(l.Md + blk.cx + blk.dx * k, l.Md + blk.cy + blk.dy * k);
        if (blk.rot) ctx.rotate(blk.rot * k);
        ctx.drawImage(layer, blk.sx, blk.sy, blk.sw, blk.sh, -blk.sw / 2, -blk.sh / 2, blk.sw, blk.sh);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.globalAlpha = 1;
    }
    // the title in image space for this moment: eyes and the light sweep are painted on before the blocks cut it
    function frameSource(t) {
      const l = L, e = eyeAmount(scene.eyes, t), sp = sweepPos(scene.sweep, t);
      if (!(e > 0.001 && l.eyeLook) && sp == null) return l.base;
      const f = l.frame, c = f.getContext('2d');
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, l.W, l.H); c.drawImage(l.base, 0, 0);
      if (e > 0.001 && l.eyeLook) {
        // darken the red, then (blink) draw each eye squashed from top and bottom
        c.globalAlpha = scene.eyes.mode === 'blink' ? 1 : e;
        c.filter = 'brightness(0.12) saturate(0.6)'; c.drawImage(l.eyeLook, 0, 0); c.filter = 'none';
        c.globalAlpha = 1;
        if (scene.eyes.mode === 'blink') {
          const open = 1 - e;
          for (const bl of l.eyeBlobs) {
            const hh = bl.h * open; if (hh < 0.5) continue;
            c.drawImage(l.eyeLook, bl.x, bl.y, bl.w, bl.h, bl.x, bl.y + (bl.h - hh) / 2, bl.w, hh);
          }
        }
      }
      if (sp != null) {
        const s = scene.sweep, a = s.angle * Math.PI / 180, wpx = s.width * l.sc * l.dpr;
        const span = l.W + l.H, pos = -span / 2 - wpx + sp * (span + 2 * wpx);
        c.save(); c.globalCompositeOperation = 'source-atop'; c.translate(l.W / 2, l.H / 2); c.rotate(a);
        const gr = c.createLinearGradient(pos - wpx / 2, 0, pos + wpx / 2, 0), [r, g, b] = rgb(s.color);
        gr.addColorStop(0, `rgba(${r},${g},${b},0)`); gr.addColorStop(0.5, `rgba(${r},${g},${b},${s.opacity})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
        c.fillStyle = gr; c.fillRect(pos - wpx / 2, -span, wpx, span * 2); c.restore();
      }
      return f;
    }
    // a silhouette of `src` (big canvas) in one colour, drawn into a half-size canvas, blurred by sigma (full-size px)
    function silhouette(dst, src, color, sigma) {
      const c = dst.getContext('2d');
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, dst.width, dst.height);
      c.filter = sigma > 0.3 ? `blur(${sigma / 2}px)` : 'none';   // half-size canvas: half the blur
      c.drawImage(src, 0, 0, dst.width, dst.height); c.filter = 'none';
      c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, dst.width, dst.height);
      c.globalCompositeOperation = 'source-over';
      return dst;
    }
    // Draws the scene at time t (seconds). o.showMask: paint the glow mask in magenta (tuning aid).
    function renderAt(t, o = {}) {
      const l = layers();
      if (!l) return false;
      place();
      const g = scene.glow, s = g.on ? envelope(t, g) : 0, kf = keyframeAt(scene.keyframes, t), u = l.sc * l.dpr;
      const c = l.comp.getContext('2d');
      c.clearRect(0, 0, l.comp.width, l.comp.height);
      drawLayer(c, frameSource(t), t, 1);
      // the glow: the lit look crossfaded in
      if (s > 0.001) {
        if (l.bright) drawLayer(c, l.bright, t, s);
        else {
          const tc = l.tmp.getContext('2d'); tc.clearRect(0, 0, l.tmp.width, l.tmp.height);
          tc.filter = `brightness(${1 + 0.55 * g.intensity}) saturate(${1 + 0.25 * g.intensity})`; tc.drawImage(l.comp, 0, 0); tc.filter = 'none';
          c.globalAlpha = s; c.drawImage(l.tmp, 0, 0); c.globalAlpha = 1;
        }
      }
      if (o.showMask && l.areaCv) {
        const mk = canvasOf(l.W, l.H), mc = mk.getContext('2d'); mc.drawImage(l.areaCv, 0, 0);
        mc.globalCompositeOperation = 'source-in'; mc.fillStyle = '#ff00ff'; mc.fillRect(0, 0, l.W, l.H);
        drawLayer(c, mk, t, 0.9);
      }
      // halo source: the glowing area (or the whole title), as it is placed right now
      let haloSrc = l.comp;
      if (s > 0.001 && l.areaCv) { const tc = l.tmp.getContext('2d'); tc.clearRect(0, 0, l.tmp.width, l.tmp.height); drawLayer(tc, l.areaCv, t, 1); haloSrc = l.tmp; }

      out.setTransform(1, 0, 0, 1, 0, 0);
      out.clearRect(0, 0, cv.width, cv.height);
      const cx = cv.width / 2, cy = cv.height / 2;
      out.translate(cx + kf.x * u, cy + kf.y * u); out.rotate(kf.rot * Math.PI / 180); out.scale(kf.scale, kf.scale); out.translate(-cx, -cy);
      const kfF = (kf.brightness !== 1 ? `brightness(${kf.brightness}) ` : '') + (kf.blur > 0 ? `blur(${kf.blur * u}px) ` : '');
      const op = clamp01(kf.opacity);
      // shadows (below everything)
      const ls = scene.longShadow, lsA = ls.on ? envelope(t, ls) : 0;
      if (lsA > 0.001) {
        const sil = silhouette(l.half2, l.comp, ls.color, 0), a = ls.angle * Math.PI / 180, len = ls.length * u, steps = Math.max(2, Math.min(48, Math.round(len / 2)));
        out.filter = kfF || 'none';
        for (let i = steps; i >= 1; i--) {
          const d = len * i / steps;
          out.globalAlpha = op * ls.opacity * lsA * (1 - (i - 1) / steps * 0.6);
          out.drawImage(sil, Math.cos(a) * d, Math.sin(a) * d, cv.width, cv.height);
        }
      }
      const sh = scene.shadow, shA = sh.on ? envelope(t, sh) : 0;
      if (shA > 0.001) {
        const sil = silhouette(l.half2, l.comp, sh.color, sh.blur * u / 2);
        out.filter = kfF || 'none'; out.globalAlpha = op * sh.opacity * shA;
        out.drawImage(sil, sh.x * u, sh.y * u, cv.width, cv.height);
      }
      // glow halo: two blurred silhouettes, computed at half size
      if (s > 0.001) {
        const a = Math.min(1, g.intensity) * s, r = g.halo * u * s, [cr, cg, cb] = rgb(g.color), [or, og, ob] = outerShade(cr, cg, cb);
        out.filter = kfF || 'none';
        silhouette(l.half, haloSrc, `rgb(${or},${og},${ob})`, 13 * r);   // like CSS drop-shadow(26r): a Gaussian of 13r
        out.globalAlpha = op * 0.55 * a; out.drawImage(l.half, 0, 0, cv.width, cv.height);
        silhouette(l.half, haloSrc, `rgb(${cr},${cg},${cb})`, 5 * r);    // like drop-shadow(10r)
        out.globalAlpha = op * 0.85 * a; out.drawImage(l.half, 0, 0, cv.width, cv.height);
      }
      // the title
      out.filter = kfF || 'none'; out.globalAlpha = op;
      out.drawImage(l.comp, 0, 0);
      // particles (on top, added light for sparks)
      const p = scene.particles;
      if (p.on && l.births && l.births.length && t >= p.start && t <= particlesEnd(p)) {
        out.filter = 'none';
        out.globalCompositeOperation = p.kind === 'sparks' ? 'lighter' : 'source-over';
        const [pr, pg, pb] = rgb(p.color), total = Math.floor(p.rate * p.emit);
        let seed = (p.seed | 0) * 104729 + 7;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let i = 0; i < total; i++) {
          const born = p.start + i / Math.max(1, p.rate), r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
          const age = t - born; if (age < 0 || age > p.life) continue;
          const [bx, by] = l.births[Math.floor(r1 * l.births.length)];
          const v = p.speed * u * (0.5 + 0.8 * r2), drift = (r3 - 0.5) * p.speed * u * 0.6;
          const x = l.Md + bx + drift * age, y = l.Md + by - v * age + (p.kind === 'dust' ? Math.sin(age * 3 + r4 * 6) * 3 * u : 0);
          const life = age / p.life, alpha = (p.kind === 'sparks' ? 1 - life : Math.sin(life * Math.PI) * 0.6) * op;
          const size = p.size * u * (0.6 + 0.8 * r4) * (p.kind === 'sparks' ? 1 - life * 0.5 : 1);
          out.globalAlpha = alpha; out.fillStyle = `rgb(${pr},${pg},${pb})`;
          if (p.kind === 'sparks') out.fillRect(x - size / 2, y - size / 2, size, size);
          else { out.beginPath(); out.arc(x, y, size, 0, Math.PI * 2); out.fill(); }
        }
        out.globalCompositeOperation = 'source-over';
      }
      out.filter = 'none'; out.globalAlpha = 1; out.setTransform(1, 0, 0, 1, 0, 0);
      return true;
    }
    function show(on) { cv.style.display = on ? 'block' : 'none'; img.style.visibility = on ? 'hidden' : ''; }
    // Runs the timeline from `from` seconds at `speed`. onFrame(t, frameMs) every frame; onEnd(stats) at the end.
    function play({ from = 0, speed = 1, loop = false, onFrame, onEnd, renderOpts } = {}) {
      stop();
      // prepare masks and blocks and draw the first moment before the clock starts, so frame 1 is not a jump
      renderAt(from, renderOpts);
      playing = true; show(true);
      let t0 = 0, last = 0, frames = 0, worst = 0;
      const tick = (now) => {
        if (!playing) return;
        const dt = t0 ? now - last : 0;
        if (!t0) t0 = last = now;
        worst = Math.max(worst, dt); last = now; frames++;
        let t = from + (now - t0) / 1000 * speed;
        if (t >= scene.duration) {
          if (loop) { t0 = now; from = 0; t = 0; }
          else { playing = false; renderAt(scene.duration, renderOpts); onFrame && onFrame(scene.duration, dt); onEnd && onEnd({ frames, ms: now - t0, worst }); return; }
        }
        renderAt(t, renderOpts); onFrame && onFrame(t, dt);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    function stop() { playing = false; cancelAnimationFrame(raf); }
    function invalidate() { cacheKey = ''; }
    function destroy() { stop(); show(false); cv.remove(); }
    return { canvas: cv, scene, renderAt, play, stop, show, invalidate, destroy, get playing() { return playing; },
      get pixels() { return cv.width * cv.height; } };
  }
  // The latest moment anything in the scene changes (for "fit the timeline")
  function sceneEnd(sc) {
    let e = 0;
    if (sc.glow.on) e = Math.max(e, sc.glow.start + total(sc.glow));
    if (sc.blocks.on) e = Math.max(e, blocksEnd(sc.blocks));
    if (sc.keyframes.on) for (const k of sc.keyframes.list) e = Math.max(e, k.t);
    for (const k of ['shadow', 'longShadow']) if (sc[k].on) e = Math.max(e, sc[k].start + total(sc[k]));
    if (sc.sweep.on) e = Math.max(e, sweepEnd(sc.sweep));
    if (sc.eyes.on) e = Math.max(e, eyesEnd(sc.eyes));
    if (sc.particles.on) e = Math.max(e, particlesEnd(sc.particles));
    return e;
  }
  // plays the opening sound at its place on the timeline (seconds from now = start - from)
  function playSound(scene = SCENE, from = 0) {
    const s = scene.sound;
    if (!s.on) return 'off';
    const delay = Math.max(0, s.start - from);
    if (s.start < from - 0.05) return 'skipped';
    if (delay < 0.01) return holyChord(s);
    setTimeout(() => holyChord(s), delay * 1000);
    return 'scheduled';
  }

  // ---------- the owner's tuned effect (pasted from the tuning page, 2026-10-03) ----------
  const TUNED = {
    duration: 3.6,
    glow: { intensity: 1.1, halo: 0.8, color: '#00ffaa', rise: 0.8, hold: 0.54, fade: 2.2, on: true, start: 0, area: 'all',
      edgeThreshold: 200, edgeWidth: 2, eyeMinRed: 150, eyeDominance: 1.8 },
    keyframes: { on: true, list: [
      { t: 0, scale: 1, x: 0, y: 0, rot: 0, opacity: 1, brightness: 1, blur: 0, ease: 'easeInOut' },
      { t: 0.3, scale: 1, x: 0, y: 0, rot: 0, opacity: 1, brightness: 1.01, blur: 0, ease: 'easeInOut' },
      { t: 0.39, scale: 1, x: 0, y: 0, rot: 0, opacity: 1, brightness: 2.982, blur: 4.1, ease: 'easeInOut' },
      { t: 0.45, scale: 1, x: 0, y: 0, rot: 0, opacity: 1, brightness: 3, blur: 0, ease: 'easeInOut' },
      { t: 0.53, scale: 1, x: 0, y: 0, rot: 0, opacity: 1, brightness: 1.04, blur: 3.8, ease: 'easeInOut' },
      { t: 0.61, scale: 1, x: 0, y: 0, rot: 0, opacity: 1, brightness: 3, blur: 0, ease: 'easeInOut' },
      { t: 0.79, scale: 1, x: 0, y: 0, rot: 0, opacity: 1, brightness: 1.01, blur: 0, ease: 'easeInOut' },
      { t: 1.2, scale: 1, x: 0, y: 0, rot: 0, opacity: 1, brightness: 1, blur: 0, ease: 'easeInOut' }] },
    blocks: { on: true, mode: 'assemble', size: 6, spread: 550, direction: 'random', rotation: 220, start: 0, duration: 1.23,
      stagger: 0, ease: 'easeOut', fade: true, seed: 23 },
    sound: { volume: 0.67, pitch: 0, length: 1.1, echo: 1.2, chord: 'Am9' }
  };
  applyValues(SCENE, TUNED);

  window.CapeWatchFX = { GLOW, SOUND, CHORDS, SCENE, EASE, KF_REST, strength, filter, runGlow, holyChord, prepareSound, total, keyframeAt, createTitleFx, sceneEnd, applyValues, playSound };
})();
