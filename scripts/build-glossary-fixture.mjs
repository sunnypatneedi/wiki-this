#!/usr/bin/env node
// Builds a fixture HTTP-caching glossary wiki that ships the pinned map assets.
// Usage: node scripts/build-glossary-fixture.mjs <out-dir>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.dirname(HERE);
const OUT = process.argv[2];
if (!OUT) {
  console.error("usage: node scripts/build-glossary-fixture.mjs <out-dir>");
  process.exit(1);
}
if (fs.existsSync(OUT) && fs.readdirSync(OUT).length) {
  console.error(`build-glossary-fixture: ${OUT} is not empty`);
  process.exit(1);
}

const sources = [
  { id: "mdn", name: "MDN" },
  { id: "rfc", name: "RFC 9111" },
];
const sections = [
  { id: "freshness", name: "Freshness" },
  { id: "validation", name: "Validation" },
  { id: "shared", name: "Shared caches" },
];

// 26 public HTTP-caching terms (paraphrased). related + used drive map edges.
const raw = [
  ["cache-control", "Cache-Control", "freshness", ["mdn", "rfc"], ["max-age", "no-cache", "no-store", "private", "public", "s-maxage", "must-revalidate", "immutable"], ["freshness-lifetime", "shared-caches"]],
  ["max-age", "max-age", "freshness", ["mdn", "rfc"], ["cache-control", "s-maxage", "expires", "age"], ["freshness-lifetime"]],
  ["s-maxage", "s-maxage", "shared", ["rfc"], ["max-age", "cache-control", "private", "public"], ["freshness-lifetime", "shared-caches"]],
  ["expires", "Expires", "freshness", ["mdn", "rfc"], ["max-age", "date", "age"], ["freshness-lifetime"]],
  ["age", "Age", "freshness", ["mdn", "rfc"], ["max-age", "date", "freshness-lifetime"], ["freshness-lifetime"]],
  ["date", "Date", "freshness", ["mdn", "rfc"], ["age", "expires", "max-age"], ["freshness-lifetime"]],
  ["etag", "ETag", "validation", ["mdn", "rfc"], ["if-none-match", "if-match", "last-modified"], ["validation"]],
  ["if-none-match", "If-None-Match", "validation", ["mdn", "rfc"], ["etag", "if-match"], ["validation"]],
  ["if-match", "If-Match", "validation", ["mdn", "rfc"], ["etag", "if-none-match"], ["validation"]],
  ["last-modified", "Last-Modified", "validation", ["mdn", "rfc"], ["if-modified-since", "etag"], ["validation"]],
  ["if-modified-since", "If-Modified-Since", "validation", ["mdn", "rfc"], ["last-modified", "if-unmodified-since"], ["validation"]],
  ["if-unmodified-since", "If-Unmodified-Since", "validation", ["mdn", "rfc"], ["last-modified", "if-modified-since"], ["validation"]],
  ["private", "private", "shared", ["mdn", "rfc"], ["public", "cache-control", "s-maxage"], ["shared-caches"]],
  ["public", "public", "shared", ["mdn", "rfc"], ["private", "cache-control", "s-maxage"], ["shared-caches"]],
  ["no-cache", "no-cache", "validation", ["mdn", "rfc"], ["cache-control", "no-store", "must-revalidate"], ["validation", "freshness-lifetime"]],
  ["no-store", "no-store", "freshness", ["mdn", "rfc"], ["cache-control", "no-cache"], ["freshness-lifetime"]],
  ["must-revalidate", "must-revalidate", "validation", ["mdn", "rfc"], ["proxy-revalidate", "cache-control", "no-cache"], ["validation"]],
  ["proxy-revalidate", "proxy-revalidate", "shared", ["mdn", "rfc"], ["must-revalidate", "cache-control"], ["shared-caches", "validation"]],
  ["immutable", "immutable", "freshness", ["mdn"], ["cache-control", "max-age"], ["freshness-lifetime"]],
  ["vary", "Vary", "shared", ["mdn", "rfc"], ["cache-control", "public"], ["shared-caches"]],
  ["stale-while-revalidate", "stale-while-revalidate", "freshness", ["mdn"], ["stale-if-error", "max-age", "cache-control"], ["freshness-lifetime"]],
  ["stale-if-error", "stale-if-error", "freshness", ["mdn"], ["stale-while-revalidate", "cache-control"], ["freshness-lifetime"]],
  ["freshness-lifetime", "freshness lifetime", "freshness", ["mdn", "rfc"], ["max-age", "age", "expires", "cache-control"], ["freshness-lifetime"]],
  ["heuristic-freshness", "heuristic freshness", "freshness", ["mdn", "rfc"], ["freshness-lifetime", "last-modified", "expires"], ["freshness-lifetime"]],
  ["validation", "validation", "validation", ["mdn", "rfc"], ["etag", "last-modified", "if-none-match"], ["validation"]],
  ["shared-caches", "shared caches", "shared", ["mdn", "rfc"], ["private", "public", "s-maxage", "vary"], ["shared-caches"]],
];

const defs = {
  "cache-control": {
    mdn: "The main header that tells browsers and other caches how long, and where, a response may be stored.",
    rfc: "A response directive list that controls freshness, reuse, and whether a cache may store the representation.",
  },
  "max-age": {
    mdn: "The number of seconds a response stays fresh after it is generated.",
    rfc: "A freshness lifetime in seconds, measured from the origin's Date.",
  },
  "s-maxage": {
    rfc: "A freshness lifetime, in seconds, that applies only to shared caches and overrides max-age for them.",
  },
  expires: {
    mdn: "An absolute time after which the response is considered stale.",
    rfc: "A timestamp that gives an upper bound on freshness when Cache-Control max-age is absent.",
  },
  age: {
    mdn: "How long, in seconds, the response has been in caches along the path.",
    rfc: "A sender estimate of how long the response has been resident in caches.",
  },
  date: {
    mdn: "When the origin generated the message.",
    rfc: "The date and time at which the message was originated.",
  },
  etag: {
    mdn: "An opaque validator the server can use to see if a stored copy is still current.",
    rfc: "A validator field on a representation, compared in conditional requests.",
  },
  "if-none-match": {
    mdn: "The request header that sends stored ETags so the server can answer 304 Not Modified.",
    rfc: "A precondition that succeeds when none of the listed validators match.",
  },
  "if-match": {
    mdn: "A precondition that runs an update only if the stored ETag still matches.",
    rfc: "A precondition that succeeds when at least one listed validator matches.",
  },
  "last-modified": {
    mdn: "When the representation last changed, used as a weak validator.",
    rfc: "A timestamp validator compared with If-Modified-Since and If-Unmodified-Since.",
  },
  "if-modified-since": {
    mdn: "Ask for a fresh body only if the resource changed after the given time.",
    rfc: "A precondition based on Last-Modified for conditional GET.",
  },
  "if-unmodified-since": {
    mdn: "Apply a write only if the resource has not changed since the given time.",
    rfc: "A precondition that fails when Last-Modified is later than the given date.",
  },
  private: {
    mdn: "A directive that limits storage to a single-user cache, such as a browser.",
    rfc: "The response must not be stored by a shared cache.",
  },
  public: {
    mdn: "A signal that any cache may store the response, even if it would normally be private.",
    rfc: "A shared cache may store the response even when authentication was used.",
  },
  "no-cache": {
    mdn: "Caches may store the response but must revalidate before reuse.",
    rfc: "A cache must not use the response to satisfy a request without successful validation.",
  },
  "no-store": {
    mdn: "Caches must not store the response or the request that elicited it.",
    rfc: "A cache must not store any part of the request or response.",
  },
  "must-revalidate": {
    mdn: "Once stale, the cache must revalidate before reuse; it must not serve stale.",
    rfc: "A cache must not use a stale response without successful validation.",
  },
  "proxy-revalidate": {
    mdn: "Like must-revalidate, but only for shared caches.",
    rfc: "Shared caches must revalidate stale responses; private caches may ignore it.",
  },
  immutable: {
    mdn: "Hints that the URL body will not change during its freshness lifetime.",
  },
  vary: {
    mdn: "Lists request headers that select which stored variant can be reused.",
    rfc: "Determines the request-header fields that form the cache key for variants.",
  },
  "stale-while-revalidate": {
    mdn: "Allows a cache to serve a stale response while it revalidates in the background.",
  },
  "stale-if-error": {
    mdn: "Allows a cache to serve a stale response when the origin returns an error.",
  },
  "freshness-lifetime": {
    mdn: "How long a stored response can be reused before it must be checked again.",
    rfc: "The length of time between generation and when the response becomes stale.",
  },
  "heuristic-freshness": {
    mdn: "A cache estimate of freshness when the origin sent no explicit lifetime.",
    rfc: "Freshness assigned by a cache using heuristics when no explicit lifetime is present.",
  },
  validation: {
    mdn: "Checking with the origin whether a stored copy is still usable.",
    rfc: "Revalidation using validators such as ETag or Last-Modified.",
  },
  "shared-caches": {
    mdn: "Caches that serve more than one user, such as a CDN or reverse proxy.",
    rfc: "A cache that stores responses for reuse across more than one user.",
  },
};

const articles = {
  "freshness-lifetime": "Freshness lifetime",
  validation: "Validation",
  "shared-caches": "Shared caches",
};

const byId = {};
const terms = [];
for (const [id, name, sec, src, related, used] of raw) {
  terms.push([id, name, sec]);
  byId[id] = { id, name, sec, src, defs: defs[id], related, used };
}

const dataJs = `// Fixture data for the pinned glossary map (public HTTP caching concepts only).
window.WIKI = ${JSON.stringify({ title: "HTTP Caching Wiki", sources, sections, terms, articles }, null, 2)};
window.WIKI.byId = ${JSON.stringify(byId, null, 2)};
`;

const html = `<!DOCTYPE html>
<html lang="en" data-page="glossary">
<head>
<meta charset="utf-8">
<link rel="icon" href="data:,">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Glossary · HTTP Caching Wiki</title>
<link rel="stylesheet" href="assets/glossary/dict-tokens.css">
<link rel="stylesheet" href="assets/glossary/glossary-shell.css">
<link rel="stylesheet" href="assets/glossary/map.css">
</head>
<body>
<div class="app">
<aside class="side" aria-hidden="true"></aside>
<div>
<div class="top" role="banner">
  <button class="icon" type="button" data-act="menu" aria-expanded="false" aria-label="Open menu"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12"/></svg></button>
  <div class="search">
    <label class="sr" for="q">Search the wiki</label>
    <input id="q" type="search" placeholder="Search" autocomplete="off">
    <kbd>⌘K</kbd>
  </div>
  <div class="r">
    <button class="icon snd" type="button" data-sound-toggle aria-pressed="false" title="Sound is off" aria-label="Turn sound on">
      <svg class="on" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6.5h3l3.5-3v9l-3.5-3h-3z"/><path d="M11 6c.9.8.9 2.2 0 3M12.7 4.5c1.8 1.6 1.8 5.4 0 7"/></svg>
      <svg class="off" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6.5h3l3.5-3v9l-3.5-3h-3z"/><path d="M11.5 5.5l3 5M14.5 5.5l-3 5"/></svg>
    </button>
  </div>
</div>
<div class="mhead" role="banner"><span>HTTP Caching <span class="sl">Wiki</span></span><span class="mr">
  <button class="icon snd" type="button" data-sound-toggle aria-pressed="false" title="Sound is off" aria-label="Turn sound on">
    <svg class="on" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6.5h3l3.5-3v9l-3.5-3h-3z"/><path d="M11 6c.9.8.9 2.2 0 3M12.7 4.5c1.8 1.6 1.8 5.4 0 7"/></svg>
    <svg class="off" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6.5h3l3.5-3v9l-3.5-3h-3z"/><path d="M11.5 5.5l3 5M14.5 5.5l-3 5"/></svg>
  </button>
  <button class="icon" type="button" data-act="menu" aria-expanded="false" aria-label="Open menu"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12"/></svg></button>
</span></div>
<div class="mchips" role="region" aria-label="Source filter">
  <button class="it" type="button" data-src="" aria-pressed="true">All</button>
  <button class="it" type="button" data-src="mdn" aria-pressed="false">MDN</button>
  <button class="it" type="button" data-src="rfc" aria-pressed="false">RFC 9111</button>
</div>
<div class="scrimd"></div>
<div class="drawer" aria-label="Menu">
  <div class="brand"><a href="glossary.html">HTTP Caching <span class="sl">Wiki</span></a>
    <button class="icon" type="button" data-act="menu" aria-label="Close menu"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg></button>
  </div>
  <div class="nav">
    <div>
      <div class="lbl" id="sl">Sources</div>
      <div role="group" aria-labelledby="sl">
        <button class="it" type="button" data-src="" aria-pressed="true">All</button>
        <button class="it" type="button" data-src="mdn" aria-pressed="false">MDN</button>
        <button class="it" type="button" data-src="rfc" aria-pressed="false">RFC 9111</button>
      </div>
    </div>
    <nav>
      <a class="it" href="glossary.html" aria-current="page">Glossary</a>
    </nav>
  </div>
</div>

<main class="main" id="page-glossary">
  <section class="ge-stage" id="graph" aria-labelledby="g-title">
    <div class="ge-field"></div>
    <div class="ge-view">
      <canvas class="ge-gl" aria-hidden="true"></canvas>
      <div class="ge-labels" aria-hidden="true"></div>
      <div class="ge-flat" hidden></div>
    </div>
    <div class="ge-slot ge-tl" data-map-obstacle>
      <h1 id="g-title" class="ge-kick">Glossary</h1>
      <p class="sr">A 3D map of 26 terms from MDN and RFC 9111, and how they link. Each source keeps its own definition. The A to Z list below has the same terms, definitions and links.</p>
    </div>
    <div class="ge-slot ge-tc" data-map-obstacle>
      <div class="ge-chips" role="group" aria-label="Source">
        <button class="ge-chip" type="button" data-src="" aria-pressed="true">All</button>
        <button class="ge-chip" type="button" data-src="mdn" aria-pressed="false">MDN</button>
        <button class="ge-chip" type="button" data-src="rfc" aria-pressed="false">RFC 9111</button>
      </div>
    </div>
    <div class="ge-slot ge-tr" data-map-obstacle>
      <div class="ge-switch" role="group" aria-label="View">
        <button type="button" data-view="map" aria-pressed="true">Map</button>
        <button type="button" data-view="list" aria-pressed="false">List</button>
      </div>
      <button class="ge-ic" type="button" data-info aria-expanded="false" aria-controls="ge-info" aria-label="About this map"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 7.1v3.3M8 5.35h.01"/></svg></button>
      <div class="ge-info" id="ge-info" hidden role="dialog" data-map-obstacle aria-labelledby="ge-info-title">
        <p id="ge-info-title" class="ge-kick">Map key</p>
        <p>Each disc is a term. Larger discs appear in more articles. Source chips dim terms that are not in the selected source.</p>
      </div>
    </div>
    <div class="ge-slot ge-br" data-map-obstacle>
      <div class="ge-zoom" role="group" aria-label="Map view">
        <button class="ge-ic" type="button" data-zoom="in" aria-label="Zoom in"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg></button>
        <button class="ge-ic" type="button" data-zoom="out" aria-label="Zoom out"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9"/></svg></button>
        <button class="ge-ic" type="button" data-zoom="fit" aria-label="Fit the whole map (Esc)" title="Fit the whole map (Esc)"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3"/><circle cx="8" cy="8" r="1.6"/></svg></button>
      </div>
    </div>
    <p class="ge-toast" aria-hidden="true"><span>Drag to turn</span><i></i><span>Scroll to zoom</span></p>
    <aside class="ge-sheet" aria-label="Term definition" hidden></aside>
  </section>
  <h2 class="ge-listh" id="az">All terms, A to Z</h2>
  <div class="tl" id="terms" aria-labelledby="az"></div>
</main>
</div>
</div>
<script src="data.js"></script>
<script src="assets/glossary/wire.js"></script>
<script src="assets/glossary/map.js"></script>
</body>
</html>
`;

fs.mkdirSync(path.join(OUT, "assets", "glossary", "fonts"), { recursive: true });
const srcGloss = path.join(SKILL, "assets", "glossary");
for (const f of ["map.js", "map.css", "dict-tokens.css", "glossary-shell.css", "wire.js", "PIN.md"]) {
  fs.copyFileSync(path.join(srcGloss, f), path.join(OUT, "assets", "glossary", f));
}
fs.copyFileSync(
  path.join(srcGloss, "fonts", "Inter-Variable.woff2"),
  path.join(OUT, "assets", "glossary", "fonts", "Inter-Variable.woff2")
);
fs.copyFileSync(
  path.join(srcGloss, "fonts", "Inter-OFL.txt"),
  path.join(OUT, "assets", "glossary", "fonts", "Inter-OFL.txt")
);
fs.writeFileSync(path.join(OUT, "data.js"), dataJs);
fs.writeFileSync(path.join(OUT, "glossary.html"), html);
console.log(`glossary fixture: ${path.join(OUT, "glossary.html")}`);
