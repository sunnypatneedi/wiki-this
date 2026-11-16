// Wiki self-check: screenshots plus an audit per screen (AAA contrast, families, dead controls,
// alignment, overflow, words, console errors), glossary frame time and sound gating.
// Usage: node shot.mjs <wiki-dir> <screens.json> [out-dir] [name-filter]
// screens.json: [{ name, url, w, h, full?, wait?, grid?, perf?, sound?, reducedMotion?, actions? }]
// actions: { click: sel } { fill: [sel, text] } { focus: sel } { scroll: sel } { open: sel }
//          { attr: [sel, name, value] } { wait: ms }
// Needs playwright-core (or playwright) and Chrome; CHROME overrides the browser path.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [wikiDir, screensFile, outDir = path.join(wikiDir || '.', 'checks'), only] = process.argv.slice(2);
if (!wikiDir || !screensFile) {
  console.error('usage: node shot.mjs <wiki-dir> <screens.json> [out-dir] [name-filter]');
  process.exit(1);
}
const req = createRequire(path.resolve('package.json'));
const pw = (() => {
  for (const id of ['playwright-core', 'playwright', process.env.PLAYWRIGHT_CORE].filter(Boolean)) {
    try { return req(id); } catch { /* next */ }
  }
  console.error('shot: install playwright-core (npm i -D playwright-core) or set PLAYWRIGHT_CORE to its path');
  process.exit(1);
})();
const { chromium } = pw;
const BASE = 'file://' + path.resolve(wikiDir) + '/';
const screens = JSON.parse(fs.readFileSync(screensFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

// Counts AudioContexts, so a check can prove nothing sounds before a gesture.
const audioProbe = () => {
  window.__audio = 0;
  for (const k of ['AudioContext', 'webkitAudioContext']) {
    const C = window[k];
    if (!C) continue;
    window[k] = class extends C { constructor(...a) { super(...a); window.__audio++; } };
  }
};
const frameTime = () => new Promise((done) => {
  const t = []; let last = performance.now();
  const step = (now) => { t.push(now - last); last = now; if (t.length < 150) requestAnimationFrame(step); else { t.shift(); t.sort((a, b) => a - b); done({ medianMs: +t[t.length >> 1].toFixed(1), p95Ms: +t[Math.floor(t.length * 0.95)].toFixed(1), meanMs: +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(1) }); } };
  requestAnimationFrame(step);
});
const act = async (p, a) => {
  if (a.click) await p.click(a.click);
  else if (a.fill) await p.fill(a.fill[0], a.fill[1]);
  else if (a.focus) await p.focus(a.focus);
  else if (a.scroll) await p.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), a.scroll);
  else if (a.open) await p.evaluate((sel) => document.querySelectorAll(sel).forEach((d) => { d.open = true; }), a.open);
  else if (a.attr) await p.evaluate(([sel, k, v]) => document.querySelector(sel)?.setAttribute(k, v), a.attr);
  else if (a.wait) await p.waitForTimeout(a.wait);
};

const audit = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] ?? 1 }; };
  const lum = ({ r, g, b }) => [r, g, b].map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)).reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
  const run = (doc, tag) => {
    const win = doc.defaultView;
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(win.getComputedStyle(e).backgroundColor); if (c && c.a > 0.9) return c; } return parse(win.getComputedStyle(doc.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }; };
    const out = { aaa: [], aa: [], small: [], fams: new Set(), n: 0 };
    for (const el of doc.querySelectorAll('body *')) {
      if (el.closest('svg') || el.disabled || el.closest('[aria-disabled=true]')) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); if (!own) continue;
      const r = el.getBoundingClientRect(); const cs = win.getComputedStyle(el);
      if (!r.width || cs.visibility === 'hidden' || el.closest('.sr') || +cs.opacity < 1) continue;
      const fg = parse(cs.color), bg = bgOf(el); if (!fg || !bg) continue;
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); const ratio = (a + 0.05) / (b + 0.05);
      const px = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700; const large = px >= 24 || (bold && px >= 18.66);
      out.n++; out.fams.add(cs.fontFamily.split(',')[0].replace(/["']/g, '').trim());
      const s = `${tag}${el.tagName}.${el.className} "${el.textContent.trim().slice(0, 24)}" ${ratio.toFixed(2)}`;
      if (ratio < (large ? 4.5 : 7)) out.aaa.push(s); if (ratio < (large ? 3 : 4.5)) out.aa.push(s);
      if (px < 12) out.small.push(`${tag}${px}px "${el.textContent.trim().slice(0, 16)}"`);
    }
    return out;
  };
  const me = run(document, '');
  let fr = null; const ifr = document.querySelector('iframe');
  try { if (ifr && ifr.contentDocument && ifr.contentDocument.body) fr = run(ifr.contentDocument, 'frame:'); } catch (e) { fr = 'blocked'; }
  // dead controls
  const dead = [];
  document.querySelectorAll('a').forEach((a) => { const h = a.getAttribute('href'); if (!h || h === '#') dead.push('a:' + a.textContent.trim().slice(0, 20)); });
  document.querySelectorAll('button').forEach((b) => { const ok = b.disabled || b.type === 'submit' && b.form || ['data-act', 'aria-pressed', 'aria-expanded', 'data-src', 'aria-controls'].some((k) => b.hasAttribute(k)) || typeof b.onclick === 'function' || b.closest('.seg2'); if (!ok) dead.push('button:' + b.textContent.trim().slice(0, 20)); });
  // alignment groups
  const groups = {};
  document.querySelectorAll('[data-al]').forEach((e) => { const r = e.getBoundingClientRect(); if (!r.width || getComputedStyle(e).display === 'none') return; for (const g of e.dataset.al.split(' ')) (groups[g] ||= []).push(g === 'right' ? r.right : g === 'top' ? r.top : r.left); });
  // Shared top and right edges only exist on the desktop grid; phones stack those blocks.
  if (document.documentElement.clientWidth < 700) { delete groups.top; delete groups.right; }
  const al = Object.fromEntries(Object.entries(groups).filter(([, v]) => v.length > 1).map(([k, v]) => [k, +(Math.max(...v) - Math.min(...v)).toFixed(1)]));
  const W = document.documentElement.clientWidth;
  const wide = [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width && r.right > W + 1 && cs.position !== 'fixed' && !el.closest('.mchips,.rail ol,.fig .sc,.drawer'); }).map((e) => e.tagName + '.' + e.className).slice(0, 3);
  const words = (document.body.innerText.match(/[A-Za-z0-9][A-Za-z0-9'’.\-+/]*/g) || []).length;
  return { words, sw: document.documentElement.scrollWidth, W, wide, aaa: me.aaa.slice(0, 5), aaaN: me.aaa.length, aaN: me.aa.length, small: me.small.slice(0, 3), fams: [...me.fams], n: me.n,
    frame: fr === 'blocked' ? 'blocked' : fr && { aaaN: fr.aaa.length, aaa: fr.aaa.slice(0, 4), aaN: fr.aa.length, fams: [...fr.fams], n: fr.n }, dead: dead.slice(0, 6), deadN: dead.length, al, focus: document.activeElement?.matches(':focus-visible') ? document.activeElement.id : null };
};
const overlay = () => {
  const m = document.querySelector('.main,.lmain'); const cs = getComputedStyle(m); const r = m.getBoundingClientRect();
  const L = r.left + parseFloat(cs.paddingLeft), R = r.right - parseFloat(cs.paddingRight), gap = 24, cw = (R - L - 11 * gap) / 12;
  const o = document.createElement('div'); o.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999';
  for (let i = 0; i < 12; i++) { const c = document.createElement('div'); c.style.cssText = `position:absolute;top:0;bottom:0;left:${L + i * (cw + gap)}px;width:${cw}px;background:rgba(255,0,80,.08);border-left:1px solid rgba(255,0,80,.5);border-right:1px solid rgba(255,0,80,.5)`; o.appendChild(c); }
  document.body.appendChild(o);
};
const b = await chromium.launch({
  executablePath: process.env.CHROME || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined),
  channel: process.env.CHROME || fs.existsSync('/usr/bin/google-chrome') ? undefined : 'chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'],
});
const rep = [], json = {};
for (const sc of screens) {
  if (only && !sc.name.includes(only)) continue;
  // Phone widths run as a touch device (same as the dictionary's check), so touch-only copy and layout show.
  const touch = sc.touch ?? sc.w < 700;
  const ctx = await b.newContext({ viewport: { width: sc.w, height: sc.h }, hasTouch: touch, isMobile: touch, reducedMotion: sc.reducedMotion ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(audioProbe);
  const p = await ctx.newPage();
  const errs = []; p.on('console', (m) => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(BASE + sc.url); await p.waitForTimeout(sc.wait ?? 900);
  const audioBefore = await p.evaluate(() => window.__audio);
  for (const a of sc.actions || []) await act(p, a);
  const a = await p.evaluate(audit);
  // The glossary's orbit hint, as the reader sees it (touch: "Pinch to zoom").
  {
    const fr = p.frames().find((f) => f !== p.mainFrame());
    if (fr) a.hint = await fr.evaluate(() => [...document.querySelectorAll('span')].map((e) => e.parentElement).find((e) => /to zoom/.test(e?.textContent || ''))?.innerText.replace(/\s+/g, ' ').trim() || null).catch(() => null);
  }
  if (sc.perf) {
    const fr = p.frames().find((f) => f !== p.mainFrame());
    a.perf = fr ? await fr.evaluate(frameTime) : null;
  }
  if (sc.sound) {
    a.sound = await p.evaluate(() => { const t = document.querySelector('[data-sound-toggle]'); return { played: window.wikiSound && { ...window.wikiSound.stats }, pressed: t?.getAttribute('aria-pressed'), disabled: t?.getAttribute('aria-disabled'), title: t?.title, stored: localStorage.getItem('soundkit.muted'), contexts: window.__audio }; });
    a.sound.contextsBeforeGesture = audioBefore;
  }
  json[sc.name] = a;
  await p.screenshot({ path: path.join(outDir, sc.name + '.png'), fullPage: !!sc.full });
  if (sc.grid) { await p.evaluate(overlay); await p.screenshot({ path: path.join(outDir, 'grid-' + sc.name + '.png') }); }
  const line = `${sc.name} words:${a.words} err:${errs.length ? errs.join('|').slice(0, 120) : 0} hscroll:${a.sw > a.W ? a.sw : 0} wide:${a.wide.join(',') || 0} AAA-fail:${a.aaaN}/${a.n} AA-fail:${a.aaN} small:${a.small.length} fonts:${a.fams.join('|')} dead:${a.deadN} align:${JSON.stringify(a.al)}${a.frame ? ' frame:' + (a.frame === 'blocked' ? 'blocked' : `AAA-fail ${a.frame.aaaN}/${a.frame.n} AA-fail ${a.frame.aaN} fonts ${a.frame.fams.join('|')}`) : ''}${a.perf ? ' frame-ms:' + JSON.stringify(a.perf) : ''}${a.sound ? ' sound:' + JSON.stringify(a.sound) : ''}${a.focus ? ' focus:' + a.focus : ''}${a.hint ? ' hint:' + a.hint : ''}${a.aaaN ? ' :: ' + a.aaa.join(' ; ') : ''}${a.deadN ? ' :: ' + a.dead.join(',') : ''}`;
  console.log(line); rep.push(line); await ctx.close();
}
await b.close();
if (!only) { fs.writeFileSync(path.join(outDir, 'report.txt'), rep.join('\n') + '\n'); fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(json, null, 1)); }
