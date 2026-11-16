// wiki-this Dark glossary map, in the dictionary-this visual language (GraphScene.ts):
// greyscale discs shaded by links, a thin cut-out ring that lifts each disc off a tonal stage,
// hairline links that light up from the selected term, DOM labels that never cover a disc,
// another label or the chrome, calm ambient motion, and a docked term sheet.
// Raw WebGL2 (no library, no network). No WebGL2 or ?gl=0: the same map as flat SVG.
(function () {
  const W = window.WIKI;
  const stage = document.getElementById("graph");
  if (!W || !stage) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const mqReduce = matchMedia("(prefers-reduced-motion: reduce)");
  const mqPhone = matchMedia("(max-width:700px)");
  const finePointer = matchMedia("(pointer: fine)").matches;
  const coarse = matchMedia("(pointer: coarse)").matches;
  let reduce = mqReduce.matches;
  const srcName = (id) => (W.sources.find((x) => x.id === id) || { name: id }).name;
  const secName = (id) => (W.sections.find((x) => x.id === id) || { name: id }).name;
  const artName = (id) => (W.articles || {})[id] || id;

  // Tokens mirrored from dictionary-this src/design/tokens.json (scene.*), scaled to this map.
  const T = {
    fov: 50, flight: 0.95, flightArc: 0.28, introSec: 3.2, introSpin: 0.9, introTilt: 0.2,
    edgeIdle: 0.075, edgeHover: 0.25, edgeFocus: 0.38, edgeW: 1.1, edgeWFocus: 1.6,
    labelGap: 4, labelMin: 0.85, focusScale: 1.17, dimFocus: 0.86, dimFilter: 0.92,
    drift: 0.012, driftFocus: 0.5, resumeAfter: 4, ramp: 2.5, float: 0.02, floatPeriod: 13,
    pulseEvery: 2.6, pulseSec: 3.2, parallax: 0.03, cutPx: 2.5, halo: 0.16, phoneRestLabels: 10
  };
  // Disc / rim / field colours follow --ink and --paper so light and dark looks both work.
  function cssRgb(varName, fallback) {
    const probe = document.createElement('div');
    probe.style.color = `var(${varName})`;
    document.documentElement.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    const m = c && c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? [+m[1] / 255, +m[2] / 255, +m[3] / 255] : fallback;
  }
  let INK = cssRgb('--ink', [0.925, 0.933, 0.961]);
  let PAPER = cssRgb('--paper', [0.051, 0.055, 0.075]);
  let CUT = PAPER.map((v) => v * 0.35);
  let FIELD = PAPER.map((v, i) => v + (INK[i] - v) * 0.07);

  // ---------- model ----------
  const nodes = Object.values(W.byId).map((t, i) => ({
    i, id: t.id, t, used: (t.used || []).length || 1,
    shape: 0, // always a disc; source is shown by filter dimming, not by node shape
    x: 0, y: 0, z: 0, nb: new Set(), ph: [0, 0, 0]
  }));
  const idx = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges = [];
  const seen = new Set();
  const addEdge = (a, b, type) => {
    if (!idx[a] || !idx[b] || a === b) return;
    const k = a < b ? a + "|" + b : b + "|" + a;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ a: idx[a], b: idx[b], type, pulse: -1 });
    idx[a].nb.add(b); idx[b].nb.add(a);
  };
  nodes.forEach((n) => (n.t.related || []).forEach((r) => addEdge(n.id, r, 0)));
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].t.used || [], b = nodes[j].t.used || [];
      if (a.filter((x) => b.includes(x)).length >= 2) addEdge(nodes[i].id, nodes[j].id, 1);
    }
  const maxDeg = Math.max(...nodes.map((n) => n.nb.size));
  nodes.forEach((n) => (n.tone = 0.56 + 0.4 * Math.pow(n.nb.size / maxDeg, 0.8)));
  const degRank = [...nodes].sort((a, b) => b.nb.size - a.nb.size || b.used - a.used || a.t.name.localeCompare(b.t.name));
  degRank.forEach((n, k) => (n.rank = k));
  const radius = (n) => 0.042 + 0.015 * n.used;

  // ---------- deterministic layout: force pass, then a separation pass so no cluster crowds ----------
  let seed = 0x9e3779b9;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const secAxis = { freshness: [1, 0.15, 0.1], validation: [-0.7, 0.35, 0.8], shared: [-0.5, -0.45, -0.85] };
  nodes.forEach((n) => {
    const a = secAxis[n.t.sec] || [0, 0, 0];
    n.x = a[0] + (rnd() - 0.5); n.y = a[1] + (rnd() - 0.5); n.z = a[2] + (rnd() - 0.5);
    n.ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
  });
  for (let it = 0; it < 600; it++) {
    const cool = 1 - it / 600, f = nodes.map(() => [0, 0, 0]);
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const A = nodes[i], B = nodes[j];
        const dx = A.x - B.x, dy = A.y - B.y, dz = A.z - B.z, d2 = dx * dx + dy * dy + dz * dz + 0.01, d = Math.sqrt(d2), rep = 0.34 / d2;
        f[i][0] += (dx / d) * rep; f[i][1] += (dy / d) * rep; f[i][2] += (dz / d) * rep;
        f[j][0] -= (dx / d) * rep; f[j][1] -= (dy / d) * rep; f[j][2] -= (dz / d) * rep;
      }
    edges.forEach((e) => {
      const L = e.type === 0 ? 0.95 : 1.3, k = e.type === 0 ? 0.08 : 0.025;
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, dz = e.b.z - e.a.z, d = Math.hypot(dx, dy, dz) + 1e-4, s = (k * (d - L)) / d;
      f[e.a.i][0] += dx * s; f[e.a.i][1] += dy * s; f[e.a.i][2] += dz * s;
      f[e.b.i][0] -= dx * s; f[e.b.i][1] -= dy * s; f[e.b.i][2] -= dz * s;
    });
    nodes.forEach((n, i) => {
      f[i][0] -= n.x * 0.018; f[i][1] -= n.y * 0.03; f[i][2] -= n.z * 0.018;
      const l = Math.hypot(...f[i]) || 1, m = Math.min(0.08 * cool + 0.004, l);
      n.x += (f[i][0] / l) * m; n.y += (f[i][1] / l) * m; n.z += (f[i][2] / l) * m;
    });
  }
  {
    let cx = 0, cy = 0, cz = 0, r = 0;
    nodes.forEach((n) => { cx += n.x; cy += n.y; cz += n.z; });
    cx /= nodes.length; cy /= nodes.length; cz /= nodes.length;
    nodes.forEach((n) => { n.x -= cx; n.y -= cy; n.z -= cz; r = Math.max(r, Math.hypot(n.x, n.y, n.z)); });
    nodes.forEach((n) => { n.x *= 1.75 / r; n.y *= 1.75 / r; n.z *= 1.75 / r; });
    // Separation: every pair keeps clear space of 2.6 radii + 0.22, so labels have room.
    for (let it = 0; it < 80; it++)
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const A = nodes[i], B = nodes[j], min = (radius(A) + radius(B)) * 2 + 0.34;
          const dx = A.x - B.x, dy = A.y - B.y, dz = A.z - B.z, d = Math.hypot(dx, dy, dz) + 1e-5;
          if (d < min) { const p = (min - d) / d / 2; A.x += dx * p; A.y += dy * p; A.z += dz * p; B.x -= dx * p; B.y -= dy * p; B.z -= dz * p; }
        }
  }
  const R0 = Math.max(...nodes.map((n) => Math.hypot(n.x, n.y, n.z)));
  // Home angle: the turn where the fewest discs crowd each other on screen (the dense
  // max-age / s-maxage / private cluster opens up instead of stacking).
  const PITCH0 = 0.24;
  const YAW0 = (() => {
    let best = 0, bs = 1e9;
    for (let yaw = 0; yaw < 6.283; yaw += 0.05) {
      const zc = [Math.cos(PITCH0) * Math.sin(yaw), Math.sin(PITCH0), Math.cos(PITCH0) * Math.cos(yaw)], xc = [Math.cos(yaw), 0, -Math.sin(yaw)];
      const yc = [zc[1] * xc[2] - zc[2] * xc[1], zc[2] * xc[0] - zc[0] * xc[2], zc[0] * xc[1] - zc[1] * xc[0]];
      const p = nodes.map((n) => [n.x * xc[0] + n.y * xc[1] + n.z * xc[2], n.x * yc[0] + n.y * yc[1] + n.z * yc[2]]);
      let sc = 0;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const need = (radius(nodes[i]) + radius(nodes[j])) * 2.4 + 0.12, d = Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1]);
        if (d < need) sc += (need - d) * (need - d);
      }
      if (sc < bs) { bs = sc; best = yaw; }
    }
    return best;
  })();
  // Faint background dots, like the dictionary's unfocused terms far away.
  // Small and far, so they stay crisp pin-pricks instead of near-field smudges.
  const dust = [];
  for (let k = 0; k < 80; k++) {
    const u = rnd() * 2 - 1, th = rnd() * 6.283, rr = Math.max(2.8, R0 * 1.55) + rnd() * 2.2, s = Math.sqrt(1 - u * u);
    dust.push([rr * s * Math.cos(th), rr * u * 0.7, rr * s * Math.sin(th), 0.003 + rnd() * 0.0025]);
  }

  // ---------- DOM ----------
  const view = $(".ge-view", stage);
  const canvas = $(".ge-gl", stage);
  const labelsEl = $(".ge-labels", stage);
  const flat = $(".ge-flat", stage);
  const sheet = $(".ge-sheet", stage);
  const toast = $(".ge-toast", stage);
  const field = $(".ge-field", stage);
  const status = document.createElement("p");
  status.className = "sr"; status.setAttribute("role", "status");
  stage.appendChild(status);
  if (coarse && toast) toast.innerHTML = "<span>Drag to turn</span><i></i><span>Pinch to zoom</span>";
  const labs = nodes.map((n) => { const el = document.createElement("span"); el.className = "ge-lab"; el.textContent = n.t.name; labelsEl.appendChild(el); return { el, w: 0, h: 0, o: 0, goal: 0, side: 0, x: 0, y: 0, s: 1 }; });
  const measure = () => labs.forEach((l) => { l.el.style.transform = "none"; l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; });

  let filterSrc = new URLSearchParams(location.search).get("src") || "";
  let hover = null, selected = null;
  const visible = (n) => !filterSrc || n.t.src.includes(filterSrc);

  // ---------- sound: soft, muted until the page's sound toggle is on; silent under reduced motion ----------
  let actx = null;
  function sound(kind) {
    const b = $("[data-sound-toggle]");
    if (reduce || !b || b.getAttribute("aria-pressed") !== "true" || typeof AudioContext === "undefined") return;
    actx = actx || new AudioContext();
    if (actx.state === "suspended") actx.resume();
    const t0 = actx.currentTime;
    const parts = kind === "select" ? [[523.25, 0.03, 0.42], [783.99, 0.016, 0.5]] : kind === "close" ? [[392, 0.022, 0.3]] : [[1174.66, 0.009, 0.06]];
    parts.forEach(([f, g, d]) => {
      const o = actx.createOscillator(), v = actx.createGain();
      o.type = "sine"; o.frequency.value = f;
      v.gain.setValueAtTime(0.0001, t0); v.gain.exponentialRampToValueAtTime(g, t0 + 0.015); v.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(v).connect(actx.destination); o.start(t0); o.stop(t0 + d + 0.02);
    });
  }

  // ---------- term sheet ----------
  const ICON = {
    link: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 9.4l2.8-2.8M7.2 4.6l1.1-1.1a2.6 2.6 0 013.7 3.7l-1.1 1.1M8.8 11.4l-1.1 1.1a2.6 2.6 0 01-3.7-3.7l1.1-1.1"/></svg>',
    x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    chev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"/></svg>',
    prev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5"/></svg>'
  };
  const nbName = (s) => String(s).replace(/-/g, "\u2011");
  const ordered = () => nodes.filter(visible).sort((a, b) => a.t.name.replace(/^\d+ /, "").localeCompare(b.t.name.replace(/^\d+ /, ""), "en", { sensitivity: "base" }));
  function fillSheet(n) {
    const t = n.t, src = t.src;
    const nb = [...n.nb].sort((a, b) => idx[b].nb.size - idx[a].nb.size);
    const CAP = 6, more = Math.max(0, nb.length - CAP);
    const pills = nb.map((id, k) => `<button type="button" class="ge-pill"${k >= CAP ? " hidden" : ""} data-t="${id}">${idx[id].t.name}</button>`).join("")
      + (more ? `<button type="button" class="ge-pill more" aria-expanded="false" aria-label="Show ${more} more linked terms">+${more}</button>` : "");
    const used = (t.used || []).map((a) => `<li><a class="ge-row" href="article.html" data-nav="article"><span>${artName(a)}</span>${ICON.chev}</a></li>`).join("");
    const title = nbName(t.name);
    const longest = Math.max(...title.split(/\s+/).map((w) => w.length));
    const srcLine = src.map(srcName).join(" \u00b7 ") + (src.length > 1 ? " \u00b7 shared" : "");
    const list = ordered(), k = list.indexOf(n), prev = list[(k - 1 + list.length) % list.length], next = list[(k + 1) % list.length];
    let i = 0;
    const rv = () => `ge-rv" style="--i:${i++}`;
    const defs = src.map((s) => `<section class="ge-def ${rv()}"><h3 class="ge-by">${srcName(s)}</h3><p class="ge-lead">${t.defs[s]}</p></section>`).join("");
    sheet.innerHTML = `<div class="ge-grab" aria-hidden="true"></div>
      <div class="ge-bodywrap">
      <div class="ge-scroll">
        <div class="ge-head ${rv()}"><p class="ge-crumb"><span class="s">${secName(t.sec)}</span><span aria-hidden="true">/</span><span class="h">${title}</span></p>
          <div class="ge-acts"><button type="button" class="ge-ic" data-act="copy" aria-label="Copy link to this term">${ICON.link}</button><button type="button" class="ge-ic" data-act="close" aria-label="Close definition">${ICON.x}</button></div></div>
        <h2 class="ge-title ${rv()};--chars:${Math.max(7, longest + 1)}" tabindex="-1">${title}</h2>
        <p class="ge-srcs ${rv()}">${srcLine}</p>
        ${defs}
        <div class="ge-pills ${rv()}" role="group" aria-label="Linked terms">${pills}</div>
        <section class="ge-block ${rv()}"><h3 class="ge-by">Used in ${(t.used || []).length} article${(t.used || []).length === 1 ? "" : "s"}</h3><ul class="ge-used">${used}</ul></section>
      </div>
      <div class="ge-fade" aria-hidden="true"></div>
      </div>
      <nav class="ge-pager" aria-label="Previous and next term">
        <button type="button" data-t="${prev.id}"><i>${ICON.prev}</i><span><small>Prev</small><b>${prev.t.name}</b></span></button>
        <button type="button" data-t="${next.id}"><span><small>Next</small><b>${next.t.name}</b></span><i>${ICON.chev}</i></button>
      </nav>`;
  }
  function openSheet(n, opts) {
    fillSheet(n);
    sheet.hidden = false;
    stage.classList.add("has-sheet");
    $(".ge-scroll", sheet).scrollTop = 0;
    $$("#terms details").forEach((d) => d.classList.toggle("g-on", d.id === n.id));
    status.textContent = `${n.t.name} opened`;
    if (opts && opts.focus) $(".ge-title", sheet).focus({ preventScroll: true });
  }
  let returnFocus = null;
  function closeSheet() {
    if (sheet.hidden) return;
    const had = sheet.contains(document.activeElement);
    sheet.hidden = true;
    stage.classList.remove("has-sheet");
    selected = null;
    $$("#terms details").forEach((d) => d.classList.remove("g-on"));
    status.textContent = "Definition closed";
    sound("close");
    setUrl(null);
    flyTo(null);
    dirty = true;
    if (had && returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
  }
  sheet.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]");
    if (act && act.dataset.act === "close") return closeSheet();
    if (act && act.dataset.act === "copy") {
      const u = new URL("glossary.html", location.href); u.search = ""; u.searchParams.set("term", selected.id);
      const done = () => { status.textContent = "Link copied"; };
      try { navigator.clipboard.writeText(u.href).then(done, done); } catch (_) { done(); }
      return;
    }
    const m = e.target.closest(".ge-pill.more");
    if (m) { $$(".ge-pill[hidden]", sheet).forEach((x) => (x.hidden = false)); m.remove(); const f = $(".ge-pills .ge-pill:nth-child(7)", sheet); if (f) f.focus(); return; }
    const b = e.target.closest("[data-t]");
    if (b) select(b.dataset.t, { focus: e.detail === 0 || b.closest(".ge-pager") });
  });
  function setUrl(id) {
    if (document.documentElement.dataset.page !== "glossary") return;
    const u = new URL(location.href);
    if (id) u.searchParams.set("term", id); else u.searchParams.delete("term");
    history.replaceState(history.state, "", u);
  }

  // ---------- camera ----------
  const cam = { tx: 0, ty: 0, tz: 0, yaw: YAW0, pitch: PITCH0, dist: 5, sx: 0, sy: 0 };
  let fly = null, dragging = false, lastInput = -1e9, dirty = true, t0 = performance.now(), introDone = reduce;
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  const vw = () => view.clientWidth || 1, vh = () => view.clientHeight || 1;
  const sheetW = () => (!sheet.hidden && !mqPhone.matches ? sheet.offsetWidth : 0);
  const sheetH = () => (!sheet.hidden && mqPhone.matches ? sheet.offsetHeight : 0);
  // Fit every term inside the free part of the view (beside or above the sheet), with room for labels.
  function fitDist(cx, cy, cz, set, margin) {
    const yaw = cam.yaw, pitch = cam.pitch, f = Math.tan((T.fov * Math.PI) / 360);
    const fw = (vw() - sheetW()) / vw(), fh = (vh() - sheetH()) / vh();
    const tv = f * fh * margin, th = f * (vw() / vh()) * fw * margin;
    const zc = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    const xc = [zc[2], 0, -zc[0]], xl = Math.hypot(...xc) || 1; xc[0] /= xl; xc[2] /= xl;
    const yc = [zc[1] * xc[2] - zc[2] * xc[1], zc[2] * xc[0] - zc[0] * xc[2], zc[0] * xc[1] - zc[1] * xc[0]];
    let d = 0;
    set.forEach((n) => {
      const p = [n.x - cx, n.y - cy, n.z - cz], r = radius(n) * 2.2;
      const x = Math.abs(p[0] * xc[0] + p[1] * xc[1] + p[2] * xc[2]) + r, y = Math.abs(p[0] * yc[0] + p[1] * yc[1] + p[2] * yc[2]) + r, z = p[0] * zc[0] + p[1] * zc[1] + p[2] * zc[2];
      d = Math.max(d, z + x / th, z + y / tv);
    });
    return Math.max(d, 1.6);
  }
  const homeDist = () => fitDist(0, 0, 0, nodes, mqPhone.matches ? 0.92 : 0.9);
  // Focus frames the term and its links so the cluster fills the free stage.
  const focusDist = (n) => Math.max(1.35, fitDist(n.x, n.y, n.z, [n, ...[...n.nb].map((id) => idx[id])], mqPhone.matches ? 0.86 : 0.9));
  const easeOut = (x) => 1 - Math.pow(1 - x, 4);
  function flyTo(n, instant) {
    const to = n ? { tx: n.x, ty: n.y, tz: n.z, dist: focusDist(n) } : { tx: 0, ty: 0, tz: 0, dist: homeDist() };
    to.sx = -sheetW() / vw(); to.sy = sheetH() / vh();
    if (reduce || instant) { Object.assign(cam, to); fly = null; dirty = true; return; }
    const from = { tx: cam.tx, ty: cam.ty, tz: cam.tz, dist: cam.dist, sx: cam.sx, sy: cam.sy };
    const len = Math.hypot(to.tx - from.tx, to.ty - from.ty, to.tz - from.tz);
    fly = { from, to, t0: performance.now(), dur: (T.flight + len * 0.12) * 1000, arc: len > 0.3 ? T.flightArc : 0 };
  }
  function select(id, opts) {
    const n = idx[id];
    if (!n) return;
    if (!sheet.contains(document.activeElement)) returnFocus = document.activeElement;
    selected = n;
    openSheet(n, opts);
    setUrl(id);
    sound("select");
    flyTo(n, opts && opts.instant);
    pulseFrom = performance.now();
    dirty = true;
  }

  // ---------- matrices ----------
  let V = new Float32Array(16), P = new Float32Array(16), PV = new Float32Array(16), eye = [0, 0, 0];
  function mul(a, b, o) { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
  function matrices() {
    const yaw = cam.yaw + par.x, pitch = Math.max(-1.2, Math.min(1.2, cam.pitch + par.y));
    eye = [cam.tx + cam.dist * Math.cos(pitch) * Math.sin(yaw), cam.ty + cam.dist * Math.sin(pitch), cam.tz + cam.dist * Math.cos(pitch) * Math.cos(yaw)];
    let z = [eye[0] - cam.tx, eye[1] - cam.ty, eye[2] - cam.tz]; const zl = Math.hypot(...z); z = z.map((v) => v / zl);
    let x = [z[2], 0, -z[0]]; const xl = Math.hypot(...x) || 1; x = x.map((v) => v / xl);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    V.set([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]), -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]), -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]), 1]);
    const f = 1 / Math.tan((T.fov * Math.PI) / 360), a = vw() / vh(), near = 0.1, far = 40;
    P.set([f / a, 0, 0, 0, 0, f, 0, 0, -cam.sx, -cam.sy, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
    mul(P, V, PV);
  }
  const tNow = () => (performance.now() - t0) / 1000;
  function posOf(n, t) {
    if (reduce) return [n.x, n.y, n.z];
    const w = (6.283 / T.floatPeriod) * t, a = T.float * amb;
    return [n.x + Math.sin(w + n.ph[0]) * a, n.y + Math.sin(w * 0.9 + n.ph[1]) * a, n.z + Math.sin(w * 1.1 + n.ph[2]) * a];
  }
  function projectP(p, r) {
    const m = PV, X = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], Y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], Wc = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    const w = Math.max(Wc, 1e-4);
    return { x: (X / w * 0.5 + 0.5) * vw(), y: (1 - (Y / w * 0.5 + 0.5)) * vh(), r: (r * P[5] * vh() * 0.5) / w, w: Wc, front: Wc > 0.15 };
  }

  // ---------- states ----------
  function stateOf(n) {
    const f = selected, h = hover;
    if (f === n) return 4;
    if (h === n) return 3;
    if ((f && f.nb.has(n.id)) || (!f && h && h.nb.has(n.id))) return 2;
    return 1;
  }
  const aims = new Float32Array(nodes.length).fill(1), alphas = new Float32Array(nodes.length).fill(1);
  function aimOf(n) {
    if (!visible(n)) return 1 - T.dimFilter;
    if (selected && stateOf(n) < 2) return 1 - T.dimFocus;
    return 1;
  }

  // ---------- labels: never over a disc, another label, the chrome or the edge ----------
  let obstacles = [], obsAt = -1;
  const REACH = [1, 1, 1, 1.4, 1.6];
  function readObstacles() {
    const sr = stage.getBoundingClientRect();
    obstacles = [];
    $$("[data-map-obstacle]", stage).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && getComputedStyle(el).display !== "none") obstacles.push([r.left - sr.left - 6, r.top - sr.top - 6, r.right - sr.left + 6, r.bottom - sr.top + 6]);
    });
    if (toast && !toast.classList.contains("is-off")) { const r = toast.getBoundingClientRect(); obstacles.push([r.left - sr.left, r.top - sr.top - 4, r.right - sr.left, r.bottom - sr.top]); }
    if (!sheet.hidden) { const r = sheet.getBoundingClientRect(); obstacles.push([r.left - sr.left - 8, r.top - sr.top - 12, r.right - sr.left, r.bottom - sr.top]); }
  }
  const hitBox = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const hitDisc = (b, d) => { const cx = Math.max(b[0], Math.min(d.x, b[2])), cy = Math.max(b[1], Math.min(d.y, b[3])); return Math.hypot(cx - d.x, cy - d.y) < d.r; };
  let labelIntro = reduce ? 1 : 0;
  function layoutLabels(proj, dt, snap) {
    if (performance.now() - obsAt > 200 || snap) { readObstacles(); obsAt = performance.now(); }
    const Wd = vw(), Hd = vh(), phone = mqPhone.matches;
    const discs = [];
    nodes.forEach((n) => { const q = proj[n.i]; if (q.front && alphas[n.i] > 0.3) discs.push({ i: n.i, x: q.x, y: q.y, r: q.r * REACH[stateOf(n)] + T.cutPx + 2 }); });
    const tier = (n) => {
      if (!visible(n) || !proj[n.i].front) return 0;
      const s = stateOf(n);
      if (s >= 3) return s;
      if (s === 2) return 2;
      return selected ? 0 : 1;
    };
    const order = [...nodes].map((n) => [n, tier(n)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1] || a[0].rank - b[0].rank);
    const placed = [];
    const want = new Set();
    let rest = 0;
    for (const [n, tr] of order) {
      if (tr === 1 && phone && rest >= T.phoneRestLabels) break;
      const q = proj[n.i], l = labs[n.i], s = tr === 4 ? T.focusScale : 1, w = l.w * s, h = l.h * s, rr = q.r * REACH[stateOf(n)] + T.cutPx + T.labelGap;
      const boxes = [
        [q.x - w / 2, q.y - rr - h, q.x + w / 2, q.y - rr],
        [q.x - w / 2, q.y + rr, q.x + w / 2, q.y + rr + h],
        [q.x + rr, q.y - h / 2, q.x + rr + w, q.y + h / 2],
        [q.x - rr - w, q.y - h / 2, q.x - rr, q.y + h / 2]
      ];
      const tryOrder = [l.side, 0, 1, 2, 3].filter((v, k, arr) => arr.indexOf(v) === k);
      let got = -1;
      for (const k of tryOrder) {
        const b = boxes[k], pad = [b[0] - T.labelGap, b[1] - 1, b[2] + T.labelGap, b[3] + 1];
        if (b[0] < 6 || b[1] < 4 || b[2] > Wd - 6 || b[3] > Hd - 4) continue;
        if (obstacles.some((o) => hitBox(b, o))) continue;
        if (placed.some((p) => hitBox(pad, p))) continue;
        if (discs.some((d) => d.i !== n.i && hitDisc(b, d))) continue;
        got = k; break;
      }
      if (got < 0) continue;
      const b = boxes[got];
      placed.push(b); want.add(n.i);
      l.side = got; l.x = b[0]; l.y = b[1]; l.s = s; l.goal = tr >= 3 ? 1 : tr === 2 ? 0.95 : T.labelMin + (1 - T.labelMin) * (n.rank < 6 ? 1 : 0);
      if (tr === 1) rest++;
    }
    const kin = snap || reduce ? 1 : 1 - Math.exp(-dt / 0.14), kout = snap || reduce ? 1 : 1 - Math.exp(-dt / 0.05);
    labs.forEach((l, i) => {
      if (!want.has(i)) l.goal = 0;
      l.o += (l.goal - l.o) * (l.goal < l.o ? kout : kin);
      if (l.goal === 0 && l.o < 0.02) l.o = 0;
      const o = l.o * labelIntro;
      l.el.style.opacity = o.toFixed(3);
      l.el.style.visibility = o > 0.01 ? "visible" : "hidden";
      l.el.classList.toggle("is-focus", selected && selected.i === i);
      if (want.has(i)) l.el.style.transform = `translate(${l.x.toFixed(1)}px,${l.y.toFixed(1)}px) scale(${l.s})`;
    });
  }

  // ---------- WebGL2 ----------
  const forceFlat = new URLSearchParams(location.search).get("gl") === "0";
  let gl = null;
  try { gl = forceFlat ? null : canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: true, alpha: true }); } catch (_) { gl = null; }
  let progE, progN, bufE, bufN, vaoE, vaoN, dpr = 1;
  const QUAD = "const vec2 Q[6] = vec2[6](vec2(-1,-1),vec2(1,-1),vec2(1,1),vec2(-1,-1),vec2(1,1),vec2(-1,1));";
  const edgeVS = `#version 300 es
  layout(location=0) in vec3 aA; layout(location=1) in vec3 aB; layout(location=2) in vec4 aS;
  uniform mat4 uPV; uniform vec2 uRes; uniform float uDpr;
  out float vT; out float vSide; out vec4 vS; out float vDepth; out float vLen; out float vHW;
  ${QUAD}
  void main(){
    vec2 c = Q[gl_VertexID]; c.x = c.x * 0.5 + 0.5;
    vec4 A = uPV * vec4(aA, 1.0), B = uPV * vec4(aB, 1.0);
    if (A.w < 0.15 || B.w < 0.15) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec2 a = (A.xy / A.w * 0.5 + 0.5) * uRes, b = (B.xy / B.w * 0.5 + 0.5) * uRes;
    vec2 d = b - a; float L = max(length(d), 1e-3); vec2 n = vec2(-d.y, d.x) / L;
    float hw = aS.y * 0.5 * uDpr;
    vec2 p = mix(a, b, c.x) + n * c.y * (hw + 1.0);
    gl_Position = vec4(p / uRes * 2.0 - 1.0, 0.0, 1.0);
    vT = c.x; vSide = c.y * (hw + 1.0); vS = aS; vDepth = mix(A.w, B.w, c.x); vLen = L; vHW = hw;
  }`;
  const edgeFS = `#version 300 es
  precision highp float;
  in float vT; in float vSide; in vec4 vS; in float vDepth; in float vLen; in float vHW;
  uniform vec3 uInk; uniform float uDist; uniform float uDpr;
  out vec4 o;
  void main(){
    float aa = clamp(vHW + 0.5 - abs(vSide), 0.0, 1.0);
    float typ = floor(vS.z + 0.5);
    float a = vS.x * aa;
    if (typ > 0.5) { float s = mod(vT * vLen, 6.0 * uDpr); a *= step(s, 2.5 * uDpr); }
    float fog = smoothstep(uDist - 0.6, uDist + 2.8, vDepth);
    a *= 1.0 - fog * 0.6;
    if (vS.w >= 0.0) { float dx = (vT - vS.w) * vLen / uDpr; a += exp(-dx * dx / 1800.0) * 0.32 * aa * (1.0 - fog * 0.5); }
    o = vec4(uInk * a, a);
  }`;
  const nodeVS = `#version 300 es
  layout(location=0) in vec3 aC; layout(location=1) in vec4 aP; layout(location=2) in float aA;
  uniform mat4 uPV; uniform vec2 uRes; uniform float uF; uniform float uDpr;
  out vec2 vPx; out float vR; out vec4 vP; out float vA; out float vDepth;
  ${QUAD}
  void main(){
    vec2 c = Q[gl_VertexID];
    vec4 C = uPV * vec4(aC, 1.0);
    if (C.w < 0.15) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float r = aP.x * uF * uRes.y * 0.5 / C.w;
    float reach = aP.w > 3.5 ? 2.4 : aP.w > 2.5 ? 1.3 : 1.0;
    float ext = r * reach + 6.0 * uDpr;
    gl_Position = vec4(C.xy / C.w + c * ext / uRes * 2.0, 0.0, 1.0);
    vPx = c * ext; vR = r; vP = aP; vA = aA; vDepth = C.w;
  }`;
  const nodeFS = `#version 300 es
  precision highp float;
  in vec2 vPx; in float vR; in vec4 vP; in float vA; in float vDepth;
  uniform vec3 uInk; uniform vec3 uCut; uniform vec3 uField; uniform float uDist; uniform float uDpr; uniform float uHalo;
  out vec4 o;
  void main(){
    float r = vR, st = vP.w;
    float L = length(vPx);
    float fog = smoothstep(uDist - 0.4, uDist + 2.6, vDepth) * 0.6;
    if (st < 0.0) {
      float rD = min(r, 2.2 * uDpr);
      float discD = clamp(0.5 - (L - rD), 0.0, 1.0);
      float a = discD * vA * (1.0 - fog * 0.25);
      o = vec4(uInk * 0.85 * a, a);
      return;
    }
    float d = L - r;
    float disc = clamp(0.5 - d, 0.0, 1.0);
    float tone = st > 3.5 ? 1.0 : vP.y;
    vec3 col = mix(uInk * tone, uField, fog * 0.45);
    float band = clamp(0.5 - (d - ${T.cutPx.toFixed(1)} * uDpr), 0.0, 1.0) - disc;
    float rings = 0.0;
    if (st > 2.5) rings = clamp(0.55 * uDpr + 0.5 - abs(L - (r * 1.16 + 2.0 * uDpr)), 0.0, 1.0);
    if (st > 3.5) rings = max(rings, clamp(0.55 * uDpr + 0.5 - abs(L - (r * 1.32 + 4.5 * uDpr)), 0.0, 1.0));
    float halo = st > 3.5 ? exp(-max(d, 0.0) / max(r * 0.45, 4.0)) * uHalo * (1.0 - disc) : 0.0;
    float aD = disc * vA, aB = band * vA * (1.0 - fog), aR = rings * vA * 0.9, aH = halo * vA;
    vec3 c = col * aD + uCut * aB * (1.0 - aR) + uInk * aR + uInk * aH * (1.0 - aR);
    o = vec4(c, clamp(aD + aB * (1.0 - aR) + aR + aH * (1.0 - aR), 0.0, 1.0));
  }`;
  function prog(vs, fs) {
    const p = gl.createProgram();
    [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(([k, src]) => {
      const s = gl.createShader(k); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    });
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  const U = {};
  function setupGL() {
    progE = prog(edgeVS, edgeFS); progN = prog(nodeVS, nodeFS);
    ["uPV", "uRes", "uDpr", "uInk", "uDist"].forEach((u) => (U["e" + u] = gl.getUniformLocation(progE, u)));
    ["uPV", "uRes", "uF", "uDpr", "uInk", "uCut", "uField", "uDist", "uHalo"].forEach((u) => (U["n" + u] = gl.getUniformLocation(progN, u)));
    bufE = gl.createBuffer(); vaoE = gl.createVertexArray(); gl.bindVertexArray(vaoE); gl.bindBuffer(gl.ARRAY_BUFFER, bufE);
    [[0, 3, 0], [1, 3, 12], [2, 4, 24]].forEach(([l, n, off]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 40, off); gl.vertexAttribDivisor(l, 1); });
    bufN = gl.createBuffer(); vaoN = gl.createVertexArray(); gl.bindVertexArray(vaoN); gl.bindBuffer(gl.ARRAY_BUFFER, bufN);
    [[0, 3, 0], [1, 4, 12], [2, 1, 28]].forEach(([l, n, off]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 32, off); gl.vertexAttribDivisor(l, 1); });
    gl.bindVertexArray(null);
  }
  const edgeData = new Float32Array(edges.length * 10), nodeData = new Float32Array((nodes.length + dust.length) * 8);
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, mqPhone.matches ? 1.5 : 2);
    const w = Math.round(vw() * dpr), h = Math.round(vh() * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    measure();
    dirty = true;
  }

  // ---------- frame ----------
  let dot = 0.8, fieldAt = 0, last = performance.now(), amb = 0, pulseFrom = 0, nextPulse = 0, idlePulse = null, proj = [];
  function frame(now) {
    requestAnimationFrame(frame);
    if (stage.offsetParent === null || document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = tNow();
    // settle-in: a gentle quarter turn unwinding, labels fade in near the end
    let moving = false;
    if (!introDone) {
      const k = Math.min(1, t / T.introSec), e = easeOut(k);
      cam.yaw = YAW0 - T.introSpin * (1 - e); cam.pitch = PITCH0 + T.introTilt * (1 - e);
      if (!fly && !selected) cam.dist = homeDist() * (1 + 0.25 * (1 - e));
      labelIntro = Math.max(0, Math.min(1, (k - 0.55) / 0.35));
      if (k >= 1) introDone = true;
      moving = true;
    }
    if (fly) {
      const k = Math.min(1, (now - fly.t0) / fly.dur), e = easeOut(k);
      ["tx", "ty", "tz", "dist", "sx", "sy"].forEach((key) => (cam[key] = fly.from[key] + (fly.to[key] - fly.from[key]) * e));
      cam.dist *= 1 + fly.arc * Math.sin(Math.PI * k);
      if (k >= 1) fly = null;
      moving = true;
    }
    const idleFor = (now - lastInput) / 1000;
    const ambGoal = reduce || !introDone ? 0 : Math.min(1, Math.max(0, (idleFor - T.resumeAfter) / T.ramp));
    amb += (ambGoal - amb) * Math.min(1, dt * 2);
    if (!reduce && introDone && !dragging) {
      cam.yaw += T.drift * dt * (selected ? T.driftFocus : 1) * Math.max(amb, 0.0);
      par.x += (par.tx - par.x) * Math.min(1, dt / 1.2); par.y += (par.ty - par.y) * Math.min(1, dt / 1.2);
      if (amb > 0.001 || Math.abs(par.tx - par.x) > 1e-4) moving = true;
    }
    // stage light: a slow wander of the lifted centre
    if (!reduce && field && now - fieldAt > 120) { fieldAt = now; const w = t * 6.283 / 31; field.style.setProperty("--fx", (50 + Math.sin(w) * 2.5).toFixed(2) + "%"); field.style.setProperty("--fy", (46 + Math.cos(w * 0.8) * 2.5).toFixed(2) + "%"); }
    // dim states ease
    const kd = reduce ? 1 : 1 - Math.exp(-dt / 0.12);
    nodes.forEach((n) => { aims[n.i] = aimOf(n); const before = alphas[n.i]; alphas[n.i] += (aims[n.i] - alphas[n.i]) * kd; if (Math.abs(before - alphas[n.i]) > 1e-3) moving = true; });
    // link lights: from the selected term outward; otherwise an occasional soft light on one link
    edges.forEach((e) => (e.pulse = -1));
    if (!reduce && introDone) {
      if (selected) {
        const s = ((now - pulseFrom) / 1000) * 0.55;
        edges.forEach((e) => { if (e.a === selected || e.b === selected) { const c = s % 1.4; if (c <= 1.05) e.pulse = e.a === selected ? c : 1 - c; } });
        moving = true;
      } else if (amb > 0.5) {
        if (!idlePulse && now > nextPulse) { idlePulse = { e: edges[(rnd() * edges.length) | 0], t: now }; }
        if (idlePulse) { const c = (now - idlePulse.t) / (T.pulseSec * 1000); if (c > 1) { idlePulse = null; nextPulse = now + T.pulseEvery * 1000; } else idlePulse.e.pulse = c; }
      }
    }
    if (!moving && !dirty && !labsMoving() && Math.abs((selected ? 1 : 0.8) - dot) < 0.002) return;
    dirty = false;
    matrices();
    // Overview terms sit a little smaller (scene.label.overviewDot), focus brings them to full size.
    dot += ((selected ? 1 : 0.8) - dot) * (reduce ? 1 : Math.min(1, dt / 0.25));
    proj = nodes.map((n) => {
      const p = posOf(n, t); n.px = p;
      const lo = 1 - T.dimFocus, a = alphas[n.i];
      const k = Math.max(0, Math.min(1, (a - lo) / (1 - lo)));
      const scale = 0.32 + 0.68 * k;
      const q = projectP(p, radius(n) * dot * scale);
      // Cap dimmed discs so a near-camera leftover never reads as a smudge.
      if (k < 0.999 && q.r > 5) {
        const cap = 3.5 + 1.5 * k;
        n.rDraw = radius(n) * dot * scale * (cap / q.r);
        q.r = cap;
      } else n.rDraw = radius(n) * dot * scale;
      return q;
    });
    layoutLabels(proj, dt, false);
    if (gl) drawGL(t); else drawFlat();
  }
  const labsMoving = () => labs.some((l) => Math.abs(l.goal - l.o) > 0.01) || labelIntro < 1;
  function drawGL() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const f = selected, h = hover;
    edges.forEach((e, k) => {
      const o = k * 10, a = e.a.px, b = e.b.px;
      const on = f ? e.a === f || e.b === f : h ? e.a === h || e.b === h : false;
      const vis = visible(e.a) && visible(e.b);
      let al = !vis ? 0.012 : on ? (f ? T.edgeFocus : T.edgeHover) : f ? 0.018 : T.edgeIdle * (e.type ? 0.8 : 1);
      if (!f && h && !on) al *= 0.6;
      edgeData.set([a[0], a[1], a[2], b[0], b[1], b[2], al, on && f ? T.edgeWFocus : T.edgeW, e.type, e.pulse >= 0 && vis ? e.pulse : -1], o);
    });
    gl.useProgram(progE);
    gl.uniformMatrix4fv(U.euPV, false, PV); gl.uniform2f(U.euRes, canvas.width, canvas.height); gl.uniform1f(U.euDpr, dpr); gl.uniform3fv(U.euInk, INK); gl.uniform1f(U.euDist, cam.dist);
    gl.bindVertexArray(vaoE); gl.bindBuffer(gl.ARRAY_BUFFER, bufE); gl.bufferData(gl.ARRAY_BUFFER, edgeData, gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, edges.length);
    // discs back to front (dust first)
    let k = 0;
    dust.forEach((d) => { nodeData.set([d[0], d[1], d[2], d[3], 0.42, 0, -1, 0.5], k * 8); k++; });
    const order = nodes.map((n, i) => [n, proj[i].w]).sort((a, b) => b[1] - a[1]);
    order.forEach(([n]) => { nodeData.set([n.px[0], n.px[1], n.px[2], n.rDraw ?? radius(n) * dot, n.tone, 0, stateOf(n), alphas[n.i]], k * 8); k++; });
    gl.useProgram(progN);
    gl.uniformMatrix4fv(U.nuPV, false, PV); gl.uniform2f(U.nuRes, canvas.width, canvas.height); gl.uniform1f(U.nuF, P[5]); gl.uniform1f(U.nuDpr, dpr);
    gl.uniform3fv(U.nuInk, INK); gl.uniform3fv(U.nuCut, CUT); gl.uniform3fv(U.nuField, FIELD); gl.uniform1f(U.nuDist, cam.dist); gl.uniform1f(U.nuHalo, T.halo);
    gl.bindVertexArray(vaoN); gl.bindBuffer(gl.ARRAY_BUFFER, bufN); gl.bufferData(gl.ARRAY_BUFFER, nodeData, gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, k);
    gl.bindVertexArray(null);
  }

  // ---------- flat SVG (no WebGL2): same camera, same labels, no motion ----------
  const hex = (c, m) => "rgb(" + c.map((v) => Math.round(v * m * 255)).join(",") + ")";
  function drawFlat() {
    const w = vw(), h = vh();
    let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Flat map of ${nodes.length} terms. The A to Z list below has the same content.">`;
    edges.forEach((e) => {
      const a = proj[e.a.i], b = proj[e.b.i], f = selected, on = f ? e.a === f || e.b === f : hover ? e.a === hover || e.b === hover : false;
      const vis = visible(e.a) && visible(e.b);
      const al = !vis ? 0.02 : on ? (f ? T.edgeFocus : T.edgeHover) : f ? 0.03 : 0.1;
      s += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${hex(INK, 1)}" stroke-opacity="${al}" stroke-width="${on && f ? 1.6 : 1.1}"${e.type ? ' stroke-dasharray="2.5 3.5"' : ""}/>`;
    });
    [...nodes].sort((a, b) => proj[b.i].w - proj[a.i].w).forEach((n) => {
      const q = proj[n.i], st = stateOf(n), al = alphas[n.i], fill = hex(INK, st === 4 ? 1 : n.tone), cut = hex(CUT, 1), r = Math.max(3, q.r);
      s += `<g opacity="${al.toFixed(2)}">`;
      if (st >= 3) s += `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${(r * 1.16 + 2).toFixed(1)}" fill="none" stroke="${hex(INK, 1)}" stroke-width="1"/>`;
      if (st === 4) s += `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${(r * 1.32 + 4.5).toFixed(1)}" fill="none" stroke="${hex(INK, 1)}" stroke-width="1"/>`;
      s += `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}" stroke="${cut}" stroke-width="${T.cutPx * 2}" paint-order="stroke"/>`;
      s += `</g>`;
    });
    flat.innerHTML = s + "</svg>";
  }

  // ---------- input ----------
  function pick(cx, cy) {
    const sr = view.getBoundingClientRect(), x = cx - sr.left, y = cy - sr.top;
    let best = null, bw = 1e9;
    nodes.forEach((n) => {
      const q = proj[n.i];
      if (!q || !q.front || !visible(n) || alphas[n.i] < 0.3) return;
      const rr = Math.max(q.r + 3, coarse ? 18 : 9);
      if (Math.hypot(q.x - x, q.y - y) <= rr && q.w < bw) { best = n; bw = q.w; }
    });
    return best;
  }
  const target = () => (gl ? canvas : flat);
  const ptrs = new Map();
  let down = null, pinch = 0;
  function touched() { lastInput = performance.now(); if (toast && !toast.classList.contains("is-off")) { toast.classList.add("is-off"); obsAt = -1; } }
  function wireInput() {
    const el = target();
    el.addEventListener("pointerdown", (e) => {
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      el.setPointerCapture(e.pointerId);
      down = { x: e.clientX, y: e.clientY, moved: false };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
      touched();
    });
    el.addEventListener("pointermove", (e) => {
      const sr = view.getBoundingClientRect();
      if (finePointer && !reduce) { par.tx = ((e.clientX - sr.left) / sr.width - 0.5) * 2 * T.parallax; par.ty = -((e.clientY - sr.top) / sr.height - 0.5) * T.parallax; }
      if (ptrs.has(e.pointerId)) {
        const p = ptrs.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1];
        ptrs.set(e.pointerId, [e.clientX, e.clientY]);
        if (ptrs.size === 2) {
          const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (pinch && gl) { cam.dist = Math.max(1.4, Math.min(12, cam.dist * (pinch / d))); dirty = true; }
          pinch = d; if (down) down.moved = true; touched(); return;
        }
        if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) { down.moved = true; dragging = true; canvas.classList.add("is-drag"); }
        if (dragging && gl) { fly = null; introDone = true; labelIntro = 1; cam.yaw -= dx * 0.006; cam.pitch = Math.max(-1.2, Math.min(1.2, cam.pitch + dy * 0.005)); dirty = true; touched(); }
        return;
      }
      const n = pick(e.clientX, e.clientY);
      if (n !== hover) { hover = n; dirty = true; if (n) sound("hover"); }
      el.classList.toggle("is-hot", !!n);
    });
    const up = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = 0;
      if (down && !down.moved && e.type === "pointerup") {
        const n = pick(e.clientX, e.clientY);
        if (n) select(n.id); else if (!sheet.hidden) closeSheet();
      }
      if (ptrs.size === 0) { down = null; dragging = false; canvas.classList.remove("is-drag"); }
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", () => { if (hover && !dragging) { hover = null; dirty = true; el.classList.remove("is-hot"); } });
    el.addEventListener("wheel", (e) => {
      if (!gl) return;
      e.preventDefault(); fly = null; introDone = true; labelIntro = 1;
      cam.dist = Math.max(1.4, Math.min(12, cam.dist * Math.exp(e.deltaY * 0.0012)));
      dirty = true; touched();
    }, { passive: false });
  }
  function zoom(k) { fly = null; introDone = true; labelIntro = 1; const to = Math.max(1.4, Math.min(12, cam.dist * k)); if (reduce || !gl) cam.dist = to; else fly = { from: { ...cam }, to: { ...cam, dist: to }, t0: performance.now(), dur: 300, arc: 0 }; dirty = true; touched(); }
  const info = $("#ge-info", stage);
  const infoBtn = $("[data-info]", stage);
  const setInfo = (o) => {
    if (!info || !infoBtn) return;
    info.hidden = !o;
    infoBtn.setAttribute("aria-expanded", String(o));
    obsAt = -1; dirty = true;
  };
  stage.addEventListener("click", (e) => {
    if (e.target.closest("[data-info]")) { setInfo(info.hidden); return; }
    if (info && !info.hidden && !e.target.closest(".ge-info")) setInfo(false);
    const z = e.target.closest("[data-zoom]");
    if (z) { if (z.dataset.zoom === "in") zoom(1 / 1.35); else if (z.dataset.zoom === "out") zoom(1.35); else { touched(); flyTo(null); } return; }
    const v = e.target.closest("[data-view]");
    if (v) {
      if (v.dataset.view === "list") { const hd = $("#az"); hd.setAttribute("tabindex", "-1"); hd.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); hd.focus({ preventScroll: true }); }
      else stage.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  });
  const sw = $$("[data-view]", stage);
  new IntersectionObserver((es) => es.forEach((en) => { const map = en.intersectionRatio > 0.4; sw.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.view === "map") === map))); }), { threshold: [0, 0.4, 1] }).observe(stage);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || document.documentElement.dataset.page !== "glossary" || e.defaultPrevented) return;
    if (document.activeElement && document.activeElement.closest(".cmd")) return;
    if (info && !info.hidden) { setInfo(false); return; }
    if (!sheet.hidden) closeSheet(); else { touched(); flyTo(null); }
  });
  mqReduce.addEventListener("change", () => { reduce = mqReduce.matches; if (reduce) { introDone = true; labelIntro = 1; amb = 0; par.x = par.y = par.tx = par.ty = 0; } dirty = true; });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    INK = cssRgb("--ink", INK);
    PAPER = cssRgb("--paper", PAPER);
    CUT = PAPER.map((v) => v * 0.35);
    FIELD = PAPER.map((v, i) => v + (INK[i] - v) * 0.07);
    dirty = true;
  });
  setTimeout(() => { if (toast) toast.classList.add("is-off"); obsAt = -1; dirty = true; }, 7000);

  // ---------- shared wiring with common.js ----------
  function wire() {
    document.addEventListener("wiki:term", (e) => {
      const hiddenBefore = stage.offsetParent === null;
      select(e.detail, { instant: hiddenBefore });
      // The map sits at the top of the page: bring it back into view with its header.
      requestAnimationFrame(() => { if (hiddenBefore || stage.getBoundingClientRect().top < -40) window.scrollTo({ top: 0, behavior: reduce || hiddenBefore ? "auto" : "smooth" }); });
    });
    document.addEventListener("wiki:filter", (e) => {
      filterSrc = e.detail || "";
      if (selected && !visible(selected)) closeSheet();
      else if (selected) fillSheet(selected);
      dirty = true;
    });
    document.getElementById("terms").addEventListener("toggle", (e) => {
      const d = e.target;
      if (d.tagName === "DETAILS" && d.open && d.dataset.term && (!selected || selected.id !== d.dataset.term)) select(d.dataset.term);
    }, true);
    new ResizeObserver(() => { resize(); if (!fly && !dragging) flyTo(selected, true); }).observe(view);
    if (document.fonts) document.fonts.ready.then(() => { measure(); dirty = true; });
    const q0 = new URLSearchParams(location.search).get("term");
    if (q0 && idx[q0]) { introDone = true; labelIntro = 1; select(q0, { instant: true }); }
    window.__graph = {
      select, nodes, edges, cam, get gl() { return !!gl; },
      idle: () => !fly && !dragging && introDone && !labsMoving(),
      project: (id) => { const n = idx[id]; return n && proj[n.i] ? { ...proj[n.i], r: proj[n.i].r } : null; },
      alpha: (id) => alphas[idx[id].i], state: (id) => stateOf(idx[id]),
      settle: () => { introDone = true; labelIntro = 1; amb = 0; if (fly) { Object.assign(cam, fly.to); fly = null; } labs.forEach((l) => (l.o = l.goal)); dirty = true; }
    };
  }

  if (gl) {
    try { setupGL(); stage.dataset.gl = "on"; }
    catch (err) { console.warn("Term map: WebGL2 setup failed, using the flat map.", err.message); gl = null; }
  }
  if (!gl) {
    stage.dataset.gl = "off";
    canvas.hidden = true; flat.hidden = false;
    reduce = true; introDone = true; labelIntro = 1;
    if (toast) toast.innerHTML = "<span>Flat map</span><i></i><span>Click a term</span>";
  }
  resize();
  cam.dist = homeDist();
  if (reduce) { cam.yaw = YAW0; cam.pitch = PITCH0; }
  wireInput();
  wire();
  requestAnimationFrame(frame);
})();
