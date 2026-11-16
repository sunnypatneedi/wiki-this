// Neutral sample for wiki-this. Terms are paraphrased from public HTTP caching docs
// (MDN HTTP caching guide and RFC 9111). No private sources.
window.WIKI = {
  title: "HTTP Caching Wiki",
  sources: [
    { id: "mdn", name: "MDN" },
    { id: "rfc", name: "RFC 9111" }
  ],
  sections: [
    { id: "freshness", name: "Freshness" },
    { id: "validation", name: "Validation" },
    { id: "shared", name: "Shared caches" }
  ],
  terms: [
    ["cache-control", "Cache-Control", "freshness"],
    ["max-age", "max-age", "freshness"],
    ["etag", "ETag", "validation"],
    ["if-none-match", "If-None-Match", "validation"],
    ["private", "private", "shared"],
    ["s-maxage", "s-maxage", "shared"]
  ]
};
window.WIKI.byId = {
  "cache-control": {
    id: "cache-control", name: "Cache-Control", sec: "freshness",
    src: ["mdn", "rfc"],
    defs: {
      mdn: "The main header that tells browsers and other caches how long, and where, a response may be stored.",
      rfc: "A response directive list that controls freshness, reuse, and whether a cache may store the representation."
    }
  },
  "max-age": {
    id: "max-age", name: "max-age", sec: "freshness",
    src: ["mdn", "rfc"],
    defs: {
      mdn: "The number of seconds a response stays fresh after it is generated.",
      rfc: "A freshness lifetime in seconds, measured from the origin's Date."
    }
  },
  "etag": {
    id: "etag", name: "ETag", sec: "validation",
    src: ["mdn", "rfc"],
    defs: {
      mdn: "An opaque validator the server can use to see if a stored copy is still current.",
      rfc: "A validator field on a representation, compared in conditional requests."
    }
  },
  "if-none-match": {
    id: "if-none-match", name: "If-None-Match", sec: "validation",
    src: ["mdn", "rfc"],
    defs: {
      mdn: "The request header that sends stored ETags so the server can answer 304 Not Modified.",
      rfc: "A precondition that succeeds when none of the listed validators match."
    }
  },
  "private": {
    id: "private", name: "private", sec: "shared",
    src: ["mdn", "rfc"],
    defs: {
      mdn: "A directive that limits storage to a single-user cache, such as a browser.",
      rfc: "The response must not be stored by a shared cache."
    }
  },
  "s-maxage": {
    id: "s-maxage", name: "s-maxage", sec: "shared",
    src: ["rfc"],
    defs: {
      rfc: "A freshness lifetime, in seconds, that applies only to shared caches and overrides max-age for them."
    }
  }
};
