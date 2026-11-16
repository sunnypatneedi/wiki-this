#!/usr/bin/env node
// Playwright + axe checks for the glossary map fixture.
// Fails on horizontal overflow, contrast violations, or label overlap.
// Usage: node scripts/check-glossary.mjs <fixture-dir> [shots-dir]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";

const [fixtureDir, shotsDir = path.join(fixtureDir || ".", "shots")] = process.argv.slice(2);
if (!fixtureDir) {
  console.error("usage: node scripts/check-glossary.mjs <fixture-dir> [shots-dir]");
  process.exit(1);
}

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(path.join(skillRoot, "package.json"));
let chromium, AxeBuilder;
try {
  ({ chromium } = req("playwright"));
} catch {
  console.error("check-glossary: npm i -D playwright axe-core @axe-core/playwright");
  process.exit(1);
}
try {
  ({ default: AxeBuilder } = await import(
    pathToFileURL(req.resolve("@axe-core/playwright")).href
  ).then((m) => ({ default: m.default || m.AxeBuilder || m })));
} catch (err) {
  try {
    const mod = await import("@axe-core/playwright");
    AxeBuilder = mod.default || mod.AxeBuilder;
  } catch {
    console.error("check-glossary: npm i -D @axe-core/playwright", err?.message || "");
    process.exit(1);
  }
}

fs.mkdirSync(shotsDir, { recursive: true });

function serve(root) {
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".txt": "text/plain; charset=utf-8",
  };
  const server = createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    let p = path.normalize(path.join(root, decodeURIComponent(u.pathname)));
    if (!p.startsWith(path.resolve(root))) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "glossary.html");
    if (!fs.existsSync(p)) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.writeHead(200, { "Content-Type": mime[path.extname(p)] || "application/octet-stream" });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const viewports = [
  { name: "1440", width: 1440, height: 900, isMobile: false },
  { name: "390", width: 390, height: 844, isMobile: true },
  { name: "360", width: 360, height: 800, isMobile: true },
];
const schemes = ["light", "dark"];

const failures = [];
const report = [];

async function waitIdle(page) {
  await page.waitForFunction(() => window.__graph && typeof window.__graph.settle === "function");
  await page.evaluate(() => window.__graph.settle());
  await page.waitForTimeout(120);
  await page.waitForFunction(() => window.__graph.idle(), null, { timeout: 8000 }).catch(() => {});
}

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const sw = Math.max(doc.scrollWidth, body.scrollWidth);
    const cw = Math.max(doc.clientWidth, window.innerWidth);
    return { overflowPx: Math.max(0, sw - cw), scrollWidth: sw, clientWidth: cw };
  });
}

async function labelOverlap(page) {
  return page.evaluate(() => {
    const g = window.__graph;
    if (!g) return { ok: false, reason: "no __graph" };
    g.settle();
    const labs = [...document.querySelectorAll(".ge-lab")].filter((el) => {
      const o = parseFloat(el.style.opacity || "0");
      return o > 0.4 && el.style.visibility !== "hidden";
    });
    const boxes = labs.map((el) => {
      const r = el.getBoundingClientRect();
      return { el, name: el.textContent, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
    });
    const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    const labelPairs = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        if (hit(boxes[i], boxes[j])) labelPairs.push([boxes[i].name, boxes[j].name]);

    const view = document.querySelector(".ge-view").getBoundingClientRect();
    const overDisc = [];
    for (const b of boxes) {
      for (const n of g.nodes) {
        const p = g.project(n.id);
        if (!p || !p.front || g.alpha(n.id) < 0.3) continue;
        // project() is relative to .ge-view; labels are in the same box.
        const px = view.left + p.x;
        const py = view.top + p.y;
        const cx2 = Math.max(b.x0, Math.min(px, b.x1));
        const cy2 = Math.max(b.y0, Math.min(py, b.y1));
        if (Math.hypot(cx2 - px, cy2 - py) < p.r + 1 && n.t.name !== b.name)
          overDisc.push({ label: b.name, disc: n.t.name });
      }
    }
    return {
      ok: labelPairs.length === 0 && overDisc.length === 0,
      labelPairs,
      overDisc,
      visibleLabels: boxes.length,
    };
  });
}

async function openTerm(page, id) {
  await page.evaluate((term) => {
    document.dispatchEvent(new CustomEvent("wiki:term", { detail: term }));
  }, id);
  await page.waitForSelector(".ge-sheet:not([hidden])", { timeout: 5000 });
  await waitIdle(page);
}

const { server, port } = await serve(path.resolve(fixtureDir));
const base = `http://127.0.0.1:${port}/glossary.html`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader-webgl",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
  ],
});

const shotNames = [];

try {
  for (const scheme of schemes) {
    for (const vp of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.isMobile ? 2 : 1,
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        colorScheme: scheme,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const tag = `${scheme}-${vp.name}`;

      // Idle map
      await page.goto(base, { waitUntil: "networkidle" });
      await waitIdle(page);
      const ovIdle = await overflow(page);
      if (ovIdle.overflowPx > 0) failures.push(`${tag} idle overflow ${ovIdle.overflowPx}px`);
      const labsIdle = await labelOverlap(page);
      if (!labsIdle.ok)
        failures.push(
          `${tag} idle label overlap pairs=${JSON.stringify(labsIdle.labelPairs)} discs=${JSON.stringify(labsIdle.overDisc)}`
        );

      const axeIdle = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      const serious = axeIdle.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact)
      );
      // Also fail on contrast rules at any impact.
      const contrast = axeIdle.violations.filter((v) =>
        /contrast/i.test(v.id) || /color-contrast/i.test(v.id)
      );
      if (serious.length || contrast.length) {
        failures.push(
          `${tag} axe idle: ${[...serious, ...contrast]
            .map((v) => `${v.id}(${v.nodes.length})`)
            .join(", ")}`
        );
      }

      // Term open
      await openTerm(page, "cache-control");
      const ovTerm = await overflow(page);
      if (ovTerm.overflowPx > 0) failures.push(`${tag} term overflow ${ovTerm.overflowPx}px`);
      const labsTerm = await labelOverlap(page);
      if (!labsTerm.ok)
        failures.push(
          `${tag} term label overlap pairs=${JSON.stringify(labsTerm.labelPairs)} discs=${JSON.stringify(labsTerm.overDisc)}`
        );
      const axeTerm = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      const contrastTerm = axeTerm.violations.filter(
        (v) =>
          ["serious", "critical"].includes(v.impact) ||
          /contrast/i.test(v.id) ||
          /color-contrast/i.test(v.id)
      );
      if (contrastTerm.length)
        failures.push(
          `${tag} axe term: ${contrastTerm.map((v) => `${v.id}(${v.nodes.length})`).join(", ")}`
        );

      // Flat fallback ?gl=0
      await page.goto(`${base}?gl=0&term=max-age`, { waitUntil: "networkidle" });
      await waitIdle(page);
      const glOff = await page.evaluate(() => document.getElementById("graph")?.dataset.gl);
      if (glOff !== "off") failures.push(`${tag} expected data-gl=off for ?gl=0, got ${glOff}`);
      const ovFlat = await overflow(page);
      if (ovFlat.overflowPx > 0) failures.push(`${tag} flat overflow ${ovFlat.overflowPx}px`);
      const axeFlat = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      const contrastFlat = axeFlat.violations.filter(
        (v) =>
          ["serious", "critical"].includes(v.impact) ||
          /contrast/i.test(v.id) ||
          /color-contrast/i.test(v.id)
      );
      if (contrastFlat.length)
        failures.push(
          `${tag} axe flat: ${contrastFlat.map((v) => `${v.id}(${v.nodes.length})`).join(", ")}`
        );

      report.push({
        tag,
        overflow: { idle: ovIdle.overflowPx, term: ovTerm.overflowPx, flat: ovFlat.overflowPx },
        labels: { idle: labsIdle, term: labsTerm },
        axe: {
          idle: axeIdle.violations.map((v) => v.id),
          term: axeTerm.violations.map((v) => v.id),
          flat: axeFlat.violations.map((v) => v.id),
        },
        gl: glOff,
      });

      await context.close();
    }
  }

  // Six PR shots: dark map/term at 1440 and 390; light term at 1440; flat dark at 390
  const shotPlan = [
    { file: "shot-dark-map-1440.png", scheme: "dark", vp: viewports[0], url: base, term: null },
    { file: "shot-dark-term-1440.png", scheme: "dark", vp: viewports[0], url: base, term: "cache-control" },
    { file: "shot-dark-term-390.png", scheme: "dark", vp: viewports[1], url: base, term: "cache-control" },
    { file: "shot-light-term-1440.png", scheme: "light", vp: viewports[0], url: base, term: "cache-control" },
    { file: "shot-light-map-390.png", scheme: "light", vp: viewports[1], url: base, term: null },
    { file: "shot-dark-flat-390.png", scheme: "dark", vp: viewports[1], url: `${base}?gl=0`, term: "max-age" },
  ];
  for (const s of shotPlan) {
    const context = await browser.newContext({
      viewport: { width: s.vp.width, height: s.vp.height },
      deviceScaleFactor: s.vp.isMobile ? 2 : 1,
      isMobile: s.vp.isMobile,
      hasTouch: s.vp.isMobile,
      colorScheme: s.scheme,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto(s.url, { waitUntil: "networkidle" });
    await waitIdle(page);
    if (s.term) await openTerm(page, s.term);
    const dest = path.join(shotsDir, s.file);
    await page.screenshot({ path: dest, fullPage: false });
    shotNames.push(dest);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

const outReport = path.join(shotsDir, "report.json");
fs.writeFileSync(outReport, JSON.stringify({ failures, report, shots: shotNames }, null, 2));
if (failures.length) {
  console.error("check-glossary FAILED:");
  failures.forEach((f) => console.error(" -", f));
  console.error("report:", outReport);
  process.exit(1);
}
console.log("check-glossary OK");
console.log("shots:", shotNames.join("\n       "));
console.log("report:", outReport);
