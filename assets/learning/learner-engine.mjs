/*! LearnerContextKit optional connected adapter. MIT (c) 2026 Sunny Patneedi. See LICENSE. */

// src/engine/engine.ts
import { randomUUID } from "node:crypto";

// src/core/value.ts
var LearningContractError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LearningContractError";
  }
};
function nonempty(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new LearningContractError(`${label} must be nonempty`);
}
function instant(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new LearningContractError("Use a UTC ISO timestamp");
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw new LearningContractError("Invalid timestamp");
  }
  return ms;
}
function canonical(value) {
  const seen = /* @__PURE__ */ new Set();
  function visit(v) {
    if (v === null || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
    if (typeof v === "number" && Number.isFinite(v)) return JSON.stringify(v);
    if (typeof v !== "object" || v === null || seen.has(v)) throw new LearningContractError("Expected acyclic JSON data");
    seen.add(v);
    let out;
    if (Array.isArray(v)) {
      if (Object.keys(v).length !== v.length || Array.from({ length: v.length }, (_, i) => i).some((i) => !Object.hasOwn(v, i))) throw new LearningContractError("Sparse or decorated arrays are not supported");
      out = `[${v.map(visit).join(",")}]`;
    } else {
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw new LearningContractError("Expected plain object");
      out = `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${visit(v[k])}`).join(",")}}`;
    }
    seen.delete(v);
    return out;
  }
  return visit(value);
}
function immutable(value) {
  const copy = JSON.parse(canonical(value));
  const freeze = (v) => {
    if (v !== null && typeof v === "object") {
      Object.values(v).forEach(freeze);
      Object.freeze(v);
    }
  };
  freeze(copy);
  return copy;
}
function assertBinding(actual, expected) {
  nonempty(actual.tenantId, "tenantId");
  nonempty(actual.learnerId, "learnerId");
  if (actual.tenantId !== expected.tenantId || actual.learnerId !== expected.learnerId) throw new LearningContractError("Learner/tenant boundary violation");
}
function assertFields(value, allowed) {
  if (Object.keys(value).some((k) => !allowed.includes(k)) || Object.getOwnPropertySymbols(value).length) throw new LearningContractError("Unexpected contract fields");
}

// src/lesson/pack.ts
var LESSON_LIMITS = Object.freeze({
  packCharacters: 262144,
  sources: 24,
  entries: 50,
  tasks: 200,
  choices: 8,
  hints: 5,
  history: 256,
  checkpointCharacters: 1048576
});
function fail(message) {
  throw new LearningContractError(message);
}
function object(value, fields, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    fail("Invalid " + label);
  assertFields(value, fields);
  if (Object.getOwnPropertyNames(value).some((key) => !fields.includes(key) || !Object.getOwnPropertyDescriptor(value, key)?.enumerable || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value")))
    fail("Invalid JSON " + label);
}
function string(value, limit, label) {
  if (typeof value !== "string" || !value.trim() || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    fail("Invalid " + label);
}
function id(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value))
    fail("Invalid " + label);
}
function array(value, min, max, label) {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    fail("Invalid " + label);
  if (Object.getOwnPropertySymbols(value).length || Object.keys(value).length !== value.length || Array.from({ length: value.length }, (_, i) => i).some((i) => !Object.hasOwn(value, i)))
    fail("Invalid JSON " + label);
}
function ids(value, min, max, label) {
  array(value, min, max, label);
  value.forEach((item) => id(item, label));
  if (new Set(value).size !== value.length)
    fail("Duplicate " + label);
}
function unique(values, label) {
  if (new Set(values.map((value) => value.id)).size !== values.length)
    fail("Duplicate " + label);
}
function refs(values, available, label) {
  if (values.some((value) => !available.has(value)))
    fail("Unknown " + label);
}
function validateLearningPack(input) {
  const pack = input;
  object(pack, ["schemaVersion", "id", "version", "title", "sources", "entries", "tasks"], "learning pack");
  if (pack.schemaVersion !== "learning-pack-v1")
    fail("Unsupported learning pack version");
  id(pack.id, "pack.id");
  id(pack.version, "pack.version");
  string(pack.title, 160, "pack.title");
  array(pack.sources, 1, LESSON_LIMITS.sources, "sources");
  array(pack.entries, 1, LESSON_LIMITS.entries, "entries");
  array(pack.tasks, 1, LESSON_LIMITS.tasks, "tasks");
  for (const source of pack.sources) {
    object(source, ["id", "version", "title", "url", "content", "checkedAt"], "source");
    id(source.id, "source.id");
    id(source.version, "source.version");
    string(source.title, 160, "source.title");
    string(source.content, 2e4, "source.content");
    if (source.url !== null) {
      string(source.url, 2048, "source.url");
      if (/\s/.test(source.url))
        fail("Invalid source URL");
      let url;
      try {
        url = new URL(source.url);
      } catch {
        return fail("Invalid source URL");
      }
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
        fail("Unsafe source URL");
    }
    if (source.checkedAt !== null) {
      string(source.checkedAt, 32, "source.checkedAt");
      instant(source.checkedAt);
    }
  }
  for (const entry of pack.entries) {
    object(entry, ["id", "title", "objective", "skillId", "skillVersion", "rubricVersion", "sourceIds", "explanation", "taskIds"], "entry");
    for (const key of ["id", "skillId", "skillVersion", "rubricVersion"])
      id(entry[key], "entry." + key);
    string(entry.title, 160, "entry.title");
    string(entry.objective, 2e3, "entry.objective");
    string(entry.explanation, 12e3, "entry.explanation");
    ids(entry.sourceIds, 1, LESSON_LIMITS.sources, "entry.sourceIds");
    ids(entry.taskIds, 1, LESSON_LIMITS.tasks, "entry.taskIds");
  }
  for (const task of pack.tasks) {
    object(task, ["id", "version", "entryId", "familyId", "kind", "prompt", "choices", "correctChoiceId", "hints", "explanation", "sourceIds"], "task");
    for (const key of ["id", "version", "entryId", "familyId", "correctChoiceId"])
      id(task[key], "task." + key);
    if (typeof task.kind !== "string" || !["diagnostic", "practice", "check"].includes(task.kind))
      fail("Unknown task kind");
    string(task.prompt, 6e3, "task.prompt");
    string(task.explanation, 6e3, "task.explanation");
    array(task.choices, 2, LESSON_LIMITS.choices, "choices");
    for (const choice of task.choices) {
      object(choice, ["id", "text"], "choice");
      id(choice.id, "choice.id");
      string(choice.text, 2e3, "choice.text");
    }
    array(task.hints, 0, LESSON_LIMITS.hints, "hints");
    task.hints.forEach((hint) => string(hint, 2e3, "hint"));
    ids(task.sourceIds, 1, LESSON_LIMITS.sources, "task.sourceIds");
    const choices = task.choices;
    unique(choices, "choice IDs");
    if (!choices.some((choice) => choice.id === task.correctChoiceId))
      fail("Unknown correct choice");
  }
  const result = pack;
  unique(result.sources, "source IDs");
  unique(result.entries, "entry IDs");
  unique(result.tasks, "task IDs");
  const sourceIds = new Set(result.sources.map((source) => source.id));
  const entryIds = new Set(result.entries.map((entry) => entry.id));
  const taskIds = new Set(result.tasks.map((task) => task.id));
  const claimed = /* @__PURE__ */ new Set();
  for (const entry of result.entries) {
    refs(entry.sourceIds, sourceIds, "entry source reference");
    refs(entry.taskIds, taskIds, "entry task reference");
    for (const taskId of entry.taskIds) {
      if (claimed.has(taskId) || result.tasks.find((task) => task.id === taskId)?.entryId !== entry.id)
        fail("Task/entry mismatch");
      claimed.add(taskId);
    }
  }
  for (const task of result.tasks) {
    if (!entryIds.has(task.entryId) || !claimed.has(task.id))
      fail("Task/entry mismatch");
    refs(task.sourceIds, sourceIds, "task source reference");
  }
  if (canonical(result).length > LESSON_LIMITS.packCharacters)
    fail("Learning pack is too large");
  return immutable(result);
}

// src/freshness/report.ts
var FRESHNESS_LIMITS = Object.freeze({ sources: 24, updates: 96, detail: 500 });
var OUTCOMES = ["checked", "not_modified", "error", "timeout", "offline"];
var FRESHNESS = ["within_policy", "stale", "unknown"];
var RELATIONS = ["unchanged", "changed", "uncompared"];
var UPDATE_KINDS = ["published", "publisher_modified", "observed_byte_change", "recently_discovered"];
var SOURCE_FIELDS = ["id", "version", "url", "checkedAt", "lastSuccessfulCheckAt", "publisherPublishedAt", "publisherModifiedAt", "firstSeenAt", "contentChangedAt", "checkOutcome", "snapshotFreshness", "baselineSha256", "contentSha256", "contentRelation", "detail"];
function sha256(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    fail("Invalid " + label);
}
function sourceRef(value) {
  object(value, ["id", "version", "url"], "source reference");
  id(value.id, "source.id");
  id(value.version, "source.version");
  if (value.url !== null) {
    string(value.url, 2048, "source.url");
    if (/\s/.test(value.url))
      fail("Invalid source URL");
    let parsed;
    try {
      parsed = new URL(value.url);
    } catch {
      return fail("Invalid source URL");
    }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
      fail("Unsafe source URL");
  }
}
function validateFreshnessRequest(input) {
  object(input, ["sources", "windowHours", "maxCheckAgeMs"], "freshness request");
  array(input.sources, 0, FRESHNESS_LIMITS.sources, "freshness sources");
  input.sources.forEach(sourceRef);
  if (new Set(input.sources.map((source) => source.id)).size !== input.sources.length)
    fail("Duplicate source reference");
  if (typeof input.windowHours !== "number" || ![24, 168, 720].includes(input.windowHours))
    fail("Unsupported freshness window");
  if (typeof input.maxCheckAgeMs !== "number" || !Number.isSafeInteger(input.maxCheckAgeMs) || input.maxCheckAgeMs < 1 || input.maxCheckAgeMs > 365 * 864e5)
    fail("Invalid source check age");
  return immutable(input);
}
function enumeration(value, choices, label) {
  if (typeof value !== "string" || !choices.includes(value))
    fail("Invalid " + label);
}
function timestamp(value, label, ceiling) {
  string(value, 32, label);
  const result = instant(value);
  if (result > ceiling)
    fail(label + " is in the future");
  return result;
}
function optionalTimestamp(value, label, ceiling) {
  return value === null ? null : timestamp(value, label, ceiling);
}
function updatesFor(sources, asOf, hours) {
  const cutoff = instant(asOf), lower = cutoff - hours * 36e5;
  const result = [];
  for (const source of sources) {
    if (source.lastSuccessfulCheckAt === null)
      continue;
    const add = (kind, at) => {
      if (at !== null && instant(at) >= lower && instant(at) <= cutoff)
        result.push({ sourceId: source.id, sourceVersion: source.version, kind, at });
    };
    add("published", source.publisherPublishedAt);
    if (source.publisherModifiedAt !== null && (source.publisherPublishedAt === null || instant(source.publisherModifiedAt) !== instant(source.publisherPublishedAt)))
      add("publisher_modified", source.publisherModifiedAt);
    add("observed_byte_change", source.contentChangedAt);
    if (source.publisherPublishedAt === null && source.publisherModifiedAt === null && source.contentChangedAt === null)
      add("recently_discovered", source.firstSeenAt);
  }
  return result.sort((a, b) => instant(b.at) - instant(a.at) || a.sourceId.localeCompare(b.sourceId) || a.kind.localeCompare(b.kind));
}
function validateFreshnessReport(input, options) {
  object(options, ["sources", "windowHours", "now", "maxCheckAgeMs"], "freshness validation options");
  const request = validateFreshnessRequest({ sources: options.sources, windowHours: options.windowHours, maxCheckAgeMs: options.maxCheckAgeMs });
  string(options.now, 32, "now");
  const now = instant(options.now);
  object(input, ["schemaVersion", "asOf", "evaluatedAt", "windowHours", "maxCheckAgeMs", "sources", "updates"], "freshness report");
  if (input.schemaVersion !== "freshness-report-v1" || input.windowHours !== request.windowHours || input.maxCheckAgeMs !== request.maxCheckAgeMs)
    fail("Freshness report version/window/age policy mismatch");
  const asOf = timestamp(input.asOf, "asOf", now);
  if (timestamp(input.evaluatedAt, "evaluatedAt", now) < asOf)
    fail("Evaluation predates the report cutoff");
  array(input.sources, request.sources.length, request.sources.length, "source coverage");
  const byId = /* @__PURE__ */ new Map();
  for (const raw of input.sources) {
    object(raw, SOURCE_FIELDS, "source status");
    sourceRef({ id: raw.id, version: raw.version, url: raw.url });
    const bound = request.sources.find((source2) => source2.id === raw.id);
    if (!bound || bound.version !== raw.version || bound.url !== raw.url || byId.has(bound.id))
      fail("Source coverage binding mismatch");
    enumeration(raw.checkOutcome, OUTCOMES, "check outcome");
    enumeration(raw.snapshotFreshness, FRESHNESS, "snapshot freshness");
    enumeration(raw.contentRelation, RELATIONS, "content relation");
    if (raw.detail !== null)
      string(raw.detail, FRESHNESS_LIMITS.detail, "source detail");
    if (raw.baselineSha256 !== null)
      sha256(raw.baselineSha256, "baseline SHA-256");
    if (raw.contentSha256 !== null)
      sha256(raw.contentSha256, "content SHA-256");
    const checked = timestamp(raw.checkedAt, "checkedAt", asOf);
    const successful = optionalTimestamp(raw.lastSuccessfulCheckAt, "lastSuccessfulCheckAt", checked);
    const published = optionalTimestamp(raw.publisherPublishedAt, "publisherPublishedAt", asOf);
    const modified = optionalTimestamp(raw.publisherModifiedAt, "publisherModifiedAt", asOf);
    const seen = optionalTimestamp(raw.firstSeenAt, "firstSeenAt", asOf);
    const changed = optionalTimestamp(raw.contentChangedAt, "contentChangedAt", asOf);
    if (published !== null && modified !== null && modified < published)
      fail("Publisher dates are inconsistent");
    if (successful === null !== (raw.contentSha256 === null))
      fail("Successful check and content hash must agree");
    if (successful === null && (seen !== null || changed !== null))
      fail("Observation dates require a successful source check");
    if (successful !== null && (seen === null || seen > successful || changed !== null && changed > successful))
      fail("Source observation dates are inconsistent");
    if (seen !== null && changed !== null && changed < seen)
      fail("Content change predates source discovery");
    if (["checked", "not_modified"].includes(raw.checkOutcome) && (successful === null || successful !== checked))
      fail("Successful outcome requires current check metadata");
    const source = raw;
    byId.set(bound.id, immutable({
      ...source,
      snapshotFreshness: successful === null ? "unknown" : now - successful <= request.maxCheckAgeMs ? "within_policy" : "stale",
      contentRelation: source.baselineSha256 === null || source.contentSha256 === null ? "uncompared" : source.baselineSha256 === source.contentSha256 ? "unchanged" : "changed"
    }));
  }
  array(input.updates, 0, FRESHNESS_LIMITS.updates, "freshness updates");
  for (const card of input.updates) {
    object(card, ["sourceId", "sourceVersion", "kind", "at"], "freshness update");
    id(card.sourceId, "update sourceId");
    id(card.sourceVersion, "update sourceVersion");
    const source = byId.get(card.sourceId);
    if (!source || source.version !== card.sourceVersion)
      fail("Update source binding mismatch");
    enumeration(card.kind, UPDATE_KINDS, "update kind");
    timestamp(card.at, "update time", asOf);
  }
  const sources = request.sources.map((source) => byId.get(source.id));
  return immutable({
    schemaVersion: "freshness-report-v1",
    asOf: input.asOf,
    evaluatedAt: options.now,
    windowHours: request.windowHours,
    maxCheckAgeMs: request.maxCheckAgeMs,
    sources,
    updates: updatesFor(sources, input.asOf, request.windowHours)
  });
}
function meetsCurrentSourcePolicy(report) {
  return report.sources.length > 0 && report.sources.every((source) => (source.checkOutcome === "checked" || source.checkOutcome === "not_modified") && source.snapshotFreshness === "within_policy" && source.contentRelation === "unchanged" && source.lastSuccessfulCheckAt !== null && instant(report.evaluatedAt) - instant(source.lastSuccessfulCheckAt) <= report.maxCheckAgeMs && source.baselineSha256 !== null && source.baselineSha256 === source.contentSha256);
}
function createUnavailableFreshnessReport(requestInput, options) {
  const request = validateFreshnessRequest(requestInput);
  object(options, ["now", "outcome", "detail"], "unavailable report options");
  enumeration(options.outcome, ["error", "timeout", "offline"], "unavailable outcome");
  const detail = options.detail ?? "Source freshness could not be verified.";
  string(detail, FRESHNESS_LIMITS.detail, "source detail");
  return validateFreshnessReport({
    schemaVersion: "freshness-report-v1",
    asOf: options.now,
    evaluatedAt: options.now,
    windowHours: request.windowHours,
    maxCheckAgeMs: request.maxCheckAgeMs,
    sources: request.sources.map((source) => ({
      ...source,
      checkedAt: options.now,
      lastSuccessfulCheckAt: null,
      publisherPublishedAt: null,
      publisherModifiedAt: null,
      firstSeenAt: null,
      contentChangedAt: null,
      checkOutcome: options.outcome,
      snapshotFreshness: "unknown",
      baselineSha256: null,
      contentSha256: null,
      contentRelation: "uncompared",
      detail
    })),
    updates: []
  }, { ...request, now: options.now });
}

// src/freshness/http.ts
var SourceFailure = class extends Error {
};
function abortFailure(reason, name = "AbortError") {
  const error = new Error(typeof reason === "string" ? reason : "Freshness request cancelled");
  error.name = name;
  return error;
}
function wait(operation, signal) {
  return new Promise((resolve, reject2) => {
    const abort = () => {
      cleanup();
      reject2(signal.reason ?? abortFailure(null));
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    operation.then((value) => {
      cleanup();
      signal.aborted ? reject2(signal.reason ?? abortFailure(null)) : resolve(value);
    }, (error) => {
      cleanup();
      reject2(error);
    });
    if (signal.aborted)
      abort();
    else
      signal.addEventListener("abort", abort, { once: true });
  });
}
async function webSha256(bytes) {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle)
    throw new SourceFailure("SHA-256 is unavailable; configure a host WebCrypto bridge.");
  const result = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(result, (value) => value.toString(16).padStart(2, "0")).join("");
}
function fetchUrl(value) {
  const url = new URL(value);
  url.hash = "";
  return url.href;
}
function validator(value) {
  if (value === null)
    return null;
  if (!value.trim() || value.length > 512 || /[\r\n\u0000]/.test(value))
    throw new SourceFailure("Source returned an invalid HTTP validator.");
  return value;
}
function modifiedDate(value, now) {
  if (value === null)
    return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toUTCString() !== value || parsed > instant(now))
    throw new SourceFailure("Source returned an invalid or future modification date.");
  return new Date(parsed).toISOString();
}
function retainRepresentation(response) {
  return !/(?:^|,)\s*(?:no-store|private)(?:\s|=|,|$)/i.test(response.headers.get("cache-control") ?? "");
}
async function readBytes(response, maxBytes, signal) {
  const length = response.headers.get("content-length");
  if (length !== null && /^\d+$/.test(length) && Number(length) > maxBytes)
    throw new SourceFailure("Source exceeded the response byte limit.");
  if (!response.body)
    return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let count = 0;
  try {
    while (true) {
      if (signal.aborted)
        throw signal.reason ?? abortFailure(null);
      const result = await wait(reader.read(), signal);
      if (result.done)
        break;
      if (!(result.value instanceof Uint8Array))
        throw new SourceFailure("Source returned invalid response bytes.");
      count += result.value.byteLength;
      if (count > maxBytes)
        throw new SourceFailure("Source exceeded the response byte limit.");
      chunks.push(result.value.slice());
    }
  } catch (error) {
    void reader.cancel().catch(() => void 0);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
function createHttpFreshnessProvider(input) {
  object(input, ["registry", "fetch", "clock", "timeoutMs", "maxBytes", "sha256", "isOnline"], "HTTP freshness options");
  array(input.registry, 1, FRESHNESS_LIMITS.sources, "HTTP source registry");
  for (const key of ["fetch", "clock", "sha256", "isOnline"])
    if (input[key] !== void 0 && typeof input[key] !== "function")
      fail("Invalid HTTP freshness " + key);
  const fetcher = input.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function")
    fail("A fetch implementation is required");
  const clock = input.clock ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const digest2 = input.sha256 ?? webSha256;
  const online = input.isOnline;
  const timeoutMs = input.timeoutMs ?? 5e3, maxBytes = input.maxBytes ?? 262144;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3e4)
    fail("Invalid source timeout");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 2097152)
    fail("Invalid source byte limit");
  let lastClock = -Infinity;
  const time = () => {
    const now = clock();
    string(now, 32, "source clock");
    const at = instant(now);
    if (at < lastClock)
      fail("Source clock moved backwards");
    lastClock = at;
    return now;
  };
  const configuredAt = time();
  const registry = /* @__PURE__ */ new Map();
  for (const source of input.registry) {
    object(source, ["id", "version", "url", "public", "pinnedSha256", "publisherPublishedAt", "publisherModifiedAt"], "HTTP registry source");
    id(source.id, "registry id");
    id(source.version, "registry version");
    string(source.url, 2048, "registry URL");
    if (source.public !== true || registry.has(source.id) || /\s/.test(source.url))
      fail("Invalid public source registry");
    let url;
    try {
      url = new URL(source.url);
    } catch {
      return fail("Invalid registry URL");
    }
    if (url.protocol !== "https:" || url.username || url.password)
      fail("Registry requires exact HTTPS URLs without credentials");
    if (source.pinnedSha256 !== void 0)
      sha256(source.pinnedSha256, "pinned SHA-256");
    for (const field of ["publisherPublishedAt", "publisherModifiedAt"]) {
      const value = source[field];
      if (value !== void 0 && value !== null) {
        string(value, 32, field);
        if (instant(value) > instant(configuredAt))
          fail("Future registry date");
      }
    }
    if (source.publisherPublishedAt && source.publisherModifiedAt && instant(source.publisherModifiedAt) < instant(source.publisherPublishedAt))
      fail("Inconsistent registry publisher dates");
    registry.set(source.id, immutable(source));
  }
  const cache = /* @__PURE__ */ new Map();
  const generations = /* @__PURE__ */ new Map();
  const status = (source, checkedAt, outcome, detail, stored = cache.get(source.id)) => ({
    id: source.id,
    version: source.version,
    url: source.url,
    checkedAt,
    lastSuccessfulCheckAt: stored?.lastSuccessfulCheckAt ?? null,
    publisherPublishedAt: stored?.publisherPublishedAt ?? source.publisherPublishedAt ?? null,
    publisherModifiedAt: stored?.publisherModifiedAt ?? source.publisherModifiedAt ?? null,
    firstSeenAt: stored?.firstSeenAt ?? null,
    contentChangedAt: stored?.contentChangedAt ?? null,
    checkOutcome: outcome,
    snapshotFreshness: "unknown",
    baselineSha256: source.pinnedSha256 ?? null,
    contentSha256: stored?.contentSha256 ?? null,
    contentRelation: "uncompared",
    detail
  });
  const report = (request, sources, now) => validateFreshnessReport({
    schemaVersion: "freshness-report-v1",
    asOf: now,
    evaluatedAt: now,
    windowHours: request.windowHours,
    maxCheckAgeMs: request.maxCheckAgeMs,
    sources,
    updates: []
  }, { ...request, now });
  return async (requestInput, signal) => {
    const request = validateFreshnessRequest(requestInput);
    if (!signal || typeof signal.aborted !== "boolean" || typeof signal.addEventListener !== "function")
      fail("An AbortSignal is required");
    if (signal.aborted)
      throw signal.reason ?? abortFailure(null);
    const selected = request.sources.map((ref) => {
      const source = registry.get(ref.id);
      if (!source || source.version !== ref.version || source.url !== ref.url)
        return fail("Source is not in the approved registry");
      return source;
    });
    if (online !== void 0) {
      const value = online();
      if (typeof value !== "boolean")
        fail("Invalid online state");
      if (signal.aborted)
        throw signal.reason ?? abortFailure(null);
      if (!value) {
        const now = time();
        return report(request, selected.map((source) => status(source, now, "offline", "The host reported an offline connection.")), now);
      }
    }
    const controller = new AbortController();
    let timedOut = false;
    const deadline = performance.now() + timeoutMs;
    const timeout = () => {
      timedOut = true;
      controller.abort(abortFailure("Source check deadline exceeded", "TimeoutError"));
    };
    const relay = () => controller.abort(signal.reason ?? abortFailure(null));
    signal.addEventListener("abort", relay, { once: true });
    if (signal.aborted)
      relay();
    const timer = setTimeout(timeout, timeoutMs);
    const guard = () => {
      if (!controller.signal.aborted && performance.now() >= deadline)
        timeout();
      if (controller.signal.aborted)
        throw controller.signal.reason ?? abortFailure(null);
    };
    const check = async (source) => {
      let received;
      try {
        guard();
        const before = cache.get(source.id);
        const generation = (generations.get(source.id) ?? 0) + 1;
        generations.set(source.id, generation);
        const headers2 = {};
        if (before?.bytes && before.etag)
          headers2["If-None-Match"] = before.etag;
        else if (before?.bytes && before.lastModified)
          headers2["If-Modified-Since"] = before.lastModified;
        const init = {
          method: "GET",
          headers: headers2,
          redirect: "error",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          cache: "no-store",
          signal: controller.signal
        };
        const response = await wait(fetcher(fetchUrl(source.url), init).then((value) => {
          received = value;
          if (controller.signal.aborted && value.body)
            void value.body.cancel().catch(() => void 0);
          return value;
        }), controller.signal);
        guard();
        if (response.redirected || response.url && response.url !== fetchUrl(source.url))
          throw new SourceFailure("Source redirect was not accepted.");
        let stored;
        if (response.status === 304) {
          if (!before?.bytes || Object.keys(headers2).length === 0)
            throw new SourceFailure("Unexpected 304 without a cached conditional representation.");
          const etag = validator(response.headers.get("etag"));
          if (before.etag && etag && before.etag.replace(/^W\//, "") !== etag.replace(/^W\//, ""))
            throw new SourceFailure("304 validator did not match the cached representation.");
          if (response.body !== null)
            throw new SourceFailure("304 response unexpectedly contained content.");
          const now = time();
          stored = { ...before, etag: etag ?? before.etag, lastSuccessfulCheckAt: now };
        } else {
          if (response.status !== 200)
            throw new SourceFailure("Source returned HTTP " + response.status + ".");
          const bytes = await readBytes(response, maxBytes, controller.signal);
          guard();
          const contentSha256 = await wait(digest2(bytes.slice()), controller.signal);
          sha256(contentSha256, "computed SHA-256");
          guard();
          const now = time();
          const lastModified = validator(response.headers.get("last-modified"));
          const headerModified = modifiedDate(lastModified, now);
          const changed = before ? before.contentSha256 !== contentSha256 : source.pinnedSha256 !== void 0 && source.pinnedSha256 !== contentSha256;
          stored = {
            contentSha256,
            bytes,
            etag: validator(response.headers.get("etag")),
            lastModified,
            lastSuccessfulCheckAt: now,
            publisherPublishedAt: before?.publisherPublishedAt ?? source.publisherPublishedAt ?? null,
            publisherModifiedAt: source.publisherModifiedAt ?? headerModified ?? before?.publisherModifiedAt ?? null,
            firstSeenAt: before?.firstSeenAt ?? now,
            contentChangedAt: changed ? now : before?.contentChangedAt ?? null
          };
        }
        if (!retainRepresentation(response))
          stored = { ...stored, bytes: null, etag: null, lastModified: null };
        const outcome = response.status === 304 ? "not_modified" : "checked";
        const result = status(source, stored.lastSuccessfulCheckAt, outcome, null, stored);
        report({ ...request, sources: [{ id: source.id, version: source.version, url: source.url }] }, [result], stored.lastSuccessfulCheckAt);
        guard();
        if (generations.get(source.id) !== generation)
          throw new SourceFailure("Source check was superseded by a newer request.");
        cache.set(source.id, stored);
        return result;
      } catch (error) {
        if (signal.aborted)
          throw signal.reason ?? abortFailure(null);
        const outcome = timedOut ? "timeout" : "error";
        return status(source, time(), outcome, error instanceof SourceFailure ? error.message : timedOut ? "Source check deadline exceeded." : "Source request failed.");
      } finally {
        if (received?.body && !received.bodyUsed)
          void received.body.cancel().catch(() => void 0);
      }
    };
    try {
      const results = new Array(selected.length);
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(4, selected.length) }, async () => {
        while (cursor < selected.length) {
          const index = cursor++;
          results[index] = await check(selected[index]);
        }
      }));
      if (signal.aborted)
        throw signal.reason ?? abortFailure(null);
      return report(request, results, time());
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", relay);
    }
  };
}

// src/expertise/index.ts
var DEFAULT_EXPERTISE_POLICY = Object.freeze({
  version: "pilot-1",
  passScore: 0.8,
  minTaskFamilies: 3,
  minSessions: 2,
  retentionDelayDays: 7,
  maxEvidenceAgeDays: 45
});
var ExpertiseError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ExpertiseError";
  }
};
var DAY = 864e5;
var DIMENSIONS = ["conceptual", "procedural", "strategic", "diagnostic", "metacognitive", "ai_collaboration"];
var KINDS = ["diagnostic", "practice", "project", "retention", "transfer"];
var ASSISTANCE = ["none", "hint", "worked_example", "coauthored", "delegated", "unknown"];
function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new ExpertiseError(`${label} must be nonempty`);
}
function timestamp2(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new ExpertiseError(`${label} must be an ISO timestamp with timezone`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new ExpertiseError(`${label} is invalid`);
  return ms;
}
function unit(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new ExpertiseError(`${label} must be in [0,1]`);
}
function validateScope(scope) {
  for (const k of ["learnerId", "competencyId", "competencyVersion", "rubricVersion"]) required(scope[k], k);
  if (!DIMENSIONS.includes(scope.dimension)) throw new ExpertiseError("Unknown capability dimension");
}
function matches(e, s) {
  return e.learnerId === s.learnerId && e.competencyId === s.competencyId && e.competencyVersion === s.competencyVersion && e.rubricVersion === s.rubricVersion && e.dimension === s.dimension;
}
function validatePolicy(p) {
  required(p.version, "policy.version");
  unit(p.passScore, "passScore");
  if (p.passScore === 0) throw new ExpertiseError("passScore must be positive");
  for (const n of [p.minTaskFamilies, p.minSessions]) if (!Number.isSafeInteger(n) || n < 1) throw new ExpertiseError("Evidence counts must be positive integers");
  if (!Number.isFinite(p.retentionDelayDays) || p.retentionDelayDays <= 0 || !Number.isFinite(p.maxEvidenceAgeDays) || p.maxEvidenceAgeDays <= p.retentionDelayDays) {
    throw new ExpertiseError("Evidence horizon must exceed a positive retention delay");
  }
}
function verified(e) {
  return e.assessment === "verified" && e.assessor !== "model";
}
function validateEvidence(e, now) {
  validateScope(e);
  for (const k of ["id", "attemptId", "sessionId", "taskFamilyId", "contextId", "artifactRef"]) required(e[k], k);
  if (!KINDS.includes(e.kind) || !ASSISTANCE.includes(e.assistance)) throw new ExpertiseError("Invalid evidence kind/assistance");
  if (!["provisional", "verified"].includes(e.assessment) || !["human", "deterministic", "model"].includes(e.assessor)) throw new ExpertiseError("Invalid assessor/status");
  unit(e.score, "score");
  if (e.predictedSuccess !== void 0) unit(e.predictedSuccess, "predictedSuccess");
  const at = timestamp2(e.at, "evidence.at");
  if (at > now) throw new ExpertiseError("Future evidence is not admissible");
  if (e.referenceEvidenceId !== void 0) required(e.referenceEvidenceId, "referenceEvidenceId");
  if (e.lastRelevantExposureAt !== void 0 && timestamp2(e.lastRelevantExposureAt, "lastRelevantExposureAt") > at) {
    throw new ExpertiseError("Exposure cannot occur after the assessment");
  }
}
function evaluateExpertise(scope, evidence, now, policy = DEFAULT_EXPERTISE_POLICY) {
  validateScope(scope);
  validatePolicy(policy);
  const nowMs = timestamp2(now, "now");
  const scoped = evidence.filter((e) => matches(e, scope));
  const ids2 = /* @__PURE__ */ new Set();
  const attempts = /* @__PURE__ */ new Set();
  for (const e of scoped) {
    validateEvidence(e, nowMs);
    if (ids2.has(e.id) || attempts.has(e.attemptId)) throw new ExpertiseError("Duplicate evidence/attempt in this scope");
    ids2.add(e.id);
    attempts.add(e.attemptId);
  }
  const sorted = [...scoped].sort((a, b) => timestamp2(a.at, "at") - timestamp2(b.at, "at") || a.id.localeCompare(b.id));
  const fresh = sorted.filter((e) => nowMs - timestamp2(e.at, "at") <= policy.maxEvidenceAgeDays * DAY);
  const byId = new Map(sorted.map((e) => [e.id, e]));
  const excluded = [];
  const accepted = /* @__PURE__ */ new Set();
  const eligible = [];
  for (const e of sorted) {
    const reject2 = (reason) => {
      excluded.push({ id: e.id, reason });
    };
    if (!verified(e)) {
      reject2("unverified_or_model_only");
      continue;
    }
    if (e.assistance !== "none") {
      reject2("substantive_assistance_or_unknown");
      continue;
    }
    if (e.score < policy.passScore) {
      reject2("below_rubric_threshold");
      continue;
    }
    if (e.kind === "retention" || e.kind === "transfer") {
      const ref = e.referenceEvidenceId ? byId.get(e.referenceEvidenceId) : void 0;
      if (!ref || !accepted.has(ref.id) || timestamp2(ref.at, "at") >= timestamp2(e.at, "at")) {
        reject2("missing_or_unqualified_prior_evidence");
        continue;
      }
      if (sorted.some((x) => timestamp2(x.at, "at") < timestamp2(e.at, "at") && x.taskFamilyId === e.taskFamilyId)) {
        reject2("reused_task_family");
        continue;
      }
      if (e.kind === "retention") {
        if (e.lastRelevantExposureAt === void 0) {
          reject2("unknown_exposure_history");
          continue;
        }
        const exposure = timestamp2(e.lastRelevantExposureAt, "lastRelevantExposureAt");
        const knownExposure = sorted.filter((x) => timestamp2(x.at, "at") < timestamp2(e.at, "at")).reduce((latest, x) => Math.max(latest, timestamp2(x.at, "at")), timestamp2(ref.at, "at"));
        if (exposure < knownExposure || timestamp2(e.at, "at") - exposure < policy.retentionDelayDays * DAY) {
          reject2("insufficient_delay_or_inconsistent_exposure_history");
          continue;
        }
      } else if (sorted.some((x) => timestamp2(x.at, "at") < timestamp2(e.at, "at") && x.contextId === e.contextId)) {
        reject2("transfer_requires_new_context");
        continue;
      }
    }
    accepted.add(e.id);
    if (nowMs - timestamp2(e.at, "at") <= policy.maxEvidenceAgeDays * DAY) eligible.push(e);
    else reject2("stale");
  }
  const latestByFamily = /* @__PURE__ */ new Map();
  for (const e of fresh.filter((e2) => verified(e2) && e2.assistance === "none")) {
    const prev = latestByFamily.get(e.taskFamilyId);
    if (!prev || timestamp2(e.at, "at") > timestamp2(prev.at, "at") || e.score < prev.score) latestByFamily.set(e.taskFamilyId, e);
  }
  const contradictedFamilies = new Set([...latestByFamily.values()].filter((e) => e.score < policy.passScore).map((e) => e.taskFamilyId));
  const current = eligible.filter((e) => !contradictedFamilies.has(e.taskFamilyId));
  const families = new Set(current.map((e) => e.taskFamilyId));
  const sessions = new Set(current.map((e) => e.sessionId));
  const retained = current.some((e) => e.kind === "retention");
  const transferred = current.some((e) => e.kind === "transfer");
  const missing = [];
  if (families.size < policy.minTaskFamilies) missing.push("independent_breadth");
  if (sessions.size < policy.minSessions) missing.push("multiple_sessions");
  if (!retained) missing.push("delayed_retention");
  if (!transferred) missing.push("novel_transfer");
  if (contradictedFamilies.size) missing.push("contradictory_evidence");
  const assistedSuccesses = fresh.filter((e) => verified(e) && e.assistance !== "none" && e.assistance !== "unknown" && e.score >= policy.passScore).length;
  const independent = families.size >= policy.minTaskFamilies && sessions.size >= policy.minSessions;
  let status = scoped.length === 0 ? "unassessed" : "developing";
  if (assistedSuccesses && current.length === 0) status = "supported_performance";
  if (independent) status = "independent";
  if (independent && retained) status = "retained";
  if (missing.length === 0) status = "transfer_demonstrated";
  if (contradictedFamilies.size) status = "needs_recheck";
  const predictions = fresh.filter((e) => verified(e) && e.assistance === "none" && e.predictedSuccess !== void 0);
  const calibration = predictions.length ? {
    n: predictions.length,
    brierError: predictions.reduce((sum, e) => sum + ((e.predictedSuccess ?? 0) - (e.score >= policy.passScore ? 1 : 0)) ** 2, 0) / predictions.length
  } : null;
  return {
    scope: { ...scope },
    policyVersion: policy.version,
    evaluatedAt: new Date(nowMs).toISOString(),
    status,
    canClaimDurableCompetence: missing.length === 0,
    independentTaskFamilies: families.size,
    independentSessions: sessions.size,
    assistedSuccesses,
    provisionalEvidence: scoped.filter((e) => !verified(e)).length,
    staleEvidence: scoped.length - fresh.length,
    retained,
    transferred,
    missing,
    qualifyingEvidenceIds: current.map((e) => e.id),
    excludedEvidence: excluded,
    calibration
  };
}
function recommendLearningAction(report, context = {}) {
  if (context.requestsHelpOrPause) return { action: "pause_or_human_help", reason: "learner_requested_support", support: "human" };
  if (context.missingPrerequisite) return { action: "worked_example", reason: "prerequisite_gap", support: "example" };
  if (report.status === "unassessed") return { action: "diagnose", reason: "no_scoped_evidence", support: "none" };
  if (report.missing.includes("contradictory_evidence")) return { action: "targeted_feedback", reason: "unresolved_failure", support: "hint" };
  if (report.status === "supported_performance") return { action: "independent_practice", reason: "check_after_fading_support", support: "none" };
  if (context.reviewDue) return { action: "spaced_retrieval", reason: "scheduled_cold_check", support: "none" };
  if (report.missing.includes("independent_breadth") || report.missing.includes("multiple_sessions")) return { action: "independent_practice", reason: "insufficient_independent_coverage", support: "none" };
  if (!report.retained) return { action: "spaced_retrieval", reason: "schedule_delayed_evidence_not_immediate_retest", support: "none" };
  if (!report.transferred) return { action: "transfer_challenge", reason: "new_context_and_task_required", support: "none" };
  return { action: "stretch_project", reason: "extend_demonstrated_capability", support: "none" };
}

// src/evidence/ledger.ts
function sameScope(a, b) {
  return a.tenantId === b.tenantId && a.learnerId === b.learnerId && a.competencyId === b.competencyId && a.competencyVersion === b.competencyVersion && a.rubricVersion === b.rubricVersion && a.dimension === b.dimension;
}
function validateObservation(o, binding, now) {
  assertFields(o, ["id", "scope", "at", "type", ...o.type === "performance" ? ["evidence"] : ["activity", "taskFamilyId", "contextId"]]);
  assertFields(o.scope, ["tenantId", "learnerId", "competencyId", "competencyVersion", "rubricVersion", "dimension"]);
  assertBinding(o.scope, binding);
  nonempty(o.id, "observation.id");
  if (instant(o.at) > instant(now)) throw new LearningContractError("Future observation");
  evaluateExpertise(o.scope, [], now);
  if (o.type === "performance") {
    assertFields(o.evidence, ["id", "attemptId", "sessionId", "taskFamilyId", "contextId", "at", "kind", "score", "assistance", "assessment", "assessor", "artifactRef", "referenceEvidenceId", "lastRelevantExposureAt", "predictedSuccess", "learnerId", "competencyId", "competencyVersion", "rubricVersion", "dimension"]);
    if (!sameScope({ ...o.evidence, tenantId: o.scope.tenantId }, o.scope) || o.evidence.at !== o.at) throw new LearningContractError("Evidence scope/time mismatch");
    evaluateExpertise(o.scope, [o.evidence], now);
  } else if (o.type === "exposure") {
    if (!["hint_requested", "worked_example_viewed", "artifact_revised", "explanation_provided", "task_viewed"].includes(o.activity)) throw new LearningContractError("Unknown exposure activity");
    nonempty(o.taskFamilyId, "taskFamilyId");
    nonempty(o.contextId, "contextId");
  } else throw new LearningContractError("Unknown observation type");
}

// src/learner-state/project.ts
function projectLearnerState(scope, snapshot, now, policy = DEFAULT_EXPERTISE_POLICY) {
  assertBinding(scope, snapshot.binding);
  instant(now);
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision !== snapshot.observations.length) throw new LearningContractError("Invalid ledger revision");
  const ids2 = /* @__PURE__ */ new Set();
  for (const o of snapshot.observations) {
    validateObservation(o, snapshot.binding, now);
    if (ids2.has(o.id)) throw new LearningContractError("Duplicate observation in replay");
    ids2.add(o.id);
  }
  const relevant = snapshot.observations.filter((o) => sameScope(o.scope, scope)).sort((a, b) => instant(a.at) - instant(b.at) || a.id.localeCompare(b.id));
  const performances = relevant.filter((o) => o.type === "performance");
  evaluateExpertise(scope, performances.map((o) => o.evidence), now, policy);
  const historyExclusions = [];
  const admitted = performances.filter((o) => {
    const e = o.evidence;
    if (e.kind !== "retention" && e.kind !== "transfer") return true;
    const exposures = relevant.filter((x) => x.type === "exposure" && instant(x.at) <= instant(o.at));
    let reason;
    if (exposures.some((x) => x.type === "exposure" && x.taskFamilyId === e.taskFamilyId)) reason = "assessment_family_previously_exposed";
    else if (e.kind === "transfer" && exposures.some((x) => x.type === "exposure" && x.contextId === e.contextId)) reason = "transfer_context_previously_exposed";
    else if (e.kind === "retention" && exposures.some((x) => !e.lastRelevantExposureAt || instant(x.at) > instant(e.lastRelevantExposureAt))) reason = "retention_exposure_history_inconsistent";
    if (reason) {
      historyExclusions.push({ evidenceId: e.id, reason });
      return false;
    }
    return true;
  });
  const report = evaluateExpertise(scope, admitted.map((o) => o.evidence), now, policy);
  return immutable({
    projectionVersion: "learner-state-v1",
    ledgerRevision: snapshot.revision,
    scope,
    policy,
    report,
    observationIds: relevant.map((o) => o.id),
    lastExposureAt: relevant.at(-1)?.at ?? null,
    seenTaskFamilies: [...new Set(relevant.map((o) => o.type === "performance" ? o.evidence.taskFamilyId : o.taskFamilyId))],
    seenContexts: [...new Set(relevant.map((o) => o.type === "performance" ? o.evidence.contextId : o.contextId))],
    historyExclusions
  });
}

// src/scheduling/review.ts
function scheduleReview(state, now) {
  const at = instant(now);
  if (!state.lastExposureAt || state.report.qualifyingEvidenceIds.length === 0) return immutable({ status: "not_scheduled", dueAt: null, reason: "independent_evidence_required" });
  const due = instant(state.lastExposureAt) + state.policy.retentionDelayDays * 864e5;
  return immutable({ status: at >= due ? "due" : "scheduled", dueAt: new Date(due).toISOString(), reason: "configured_delay_after_latest_known_exposure" });
}

// src/lesson/session.ts
function emptyState() {
  return { history: [], turns: [], observations: [], receipts: /* @__PURE__ */ new Map(), view: null };
}
function secureId() {
  const crypto = globalThis.crypto;
  if (!crypto?.randomUUID)
    return fail("Supply newId when secure randomUUID is unavailable");
  return crypto.randomUUID();
}
function minutes(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 60)
    fail("minutes must be an integer from 1 to 60");
}
function eventInput(event) {
  const { at: ignored, ...input } = event;
  return canonical(input);
}
function eventId(event) {
  return event.kind === "answer" ? event.responseId : event.kind === "hint" ? event.requestId : null;
}
function validateEvent(input) {
  object(input, ["kind", "turnId", "taskId", "responseId", "choiceId", "requestId", "at"], "history event");
  if (input.kind === "question")
    object(input, ["kind", "turnId", "taskId", "at"], "question event");
  else if (input.kind === "answer")
    object(input, ["kind", "turnId", "responseId", "choiceId", "at"], "answer event");
  else if (input.kind === "hint")
    object(input, ["kind", "turnId", "requestId", "at"], "hint event");
  else if (input.kind === "complete" || input.kind === "unavailable")
    object(input, ["kind", "at"], "terminal event");
  else
    fail("Unknown history event");
  string(input.at, 32, "event.at");
  instant(input.at);
  if (input.kind === "complete" || input.kind === "unavailable")
    return;
  id(input.turnId, "turnId");
  if (input.kind === "question")
    id(input.taskId, "taskId");
  if (input.kind === "answer") {
    id(input.responseId, "responseId");
    id(input.choiceId, "choiceId");
  }
  if (input.kind === "hint")
    id(input.requestId, "requestId");
}
function createLessonSession(input) {
  object(input, ["pack", "entryId", "sourceIds", "goal", "minutes", "sessionId", "initialTaskId", "clock", "newId"], "lesson options");
  const pack = validateLearningPack(input.pack);
  id(input.entryId, "entryId");
  const entry = pack.entries.find((candidate) => candidate.id === input.entryId);
  if (!entry)
    return fail("Unknown lesson entry");
  if (input.clock !== void 0 && typeof input.clock !== "function")
    fail("Invalid clock");
  if (input.newId !== void 0 && typeof input.newId !== "function")
    fail("Invalid newId");
  if (input.sourceIds !== void 0)
    ids(input.sourceIds, 0, LESSON_LIMITS.sources, "sourceIds");
  if (input.goal !== void 0)
    string(input.goal, 2e3, "goal");
  if (input.minutes !== void 0)
    minutes(input.minutes);
  if (input.sessionId !== void 0)
    id(input.sessionId, "sessionId");
  if (input.initialTaskId !== void 0)
    id(input.initialTaskId, "initialTaskId");
  const constraints = { sessionId: input.sessionId, goal: input.goal, minutes: input.minutes, initialTaskId: input.initialTaskId };
  const clock = input.clock ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const newId = input.newId ?? secureId;
  const sourceIds = [...input.sourceIds ?? pack.sources.map((source) => source.id)];
  ids(sourceIds, 0, LESSON_LIMITS.sources, "sourceIds");
  if (sourceIds.some((source) => !pack.sources.some((candidate) => candidate.id === source)))
    fail("Unknown source filter");
  sourceIds.sort();
  const selected = new Set(sourceIds);
  const supporting = (references) => references.some((source) => selected.has(source));
  const eligible = entry.taskIds.map((taskId) => pack.tasks.find((task) => task.id === taskId)).filter((task) => supporting(task.sourceIds));
  if (input.initialTaskId !== void 0 && !eligible.some((task) => task.id === input.initialTaskId))
    fail("Initial task is not eligible for this entry/source filter");
  const packCanonical = canonical(pack);
  let meta = {
    sessionId: input.sessionId ?? newId(),
    goal: input.goal ?? entry.objective,
    minutes: input.minutes ?? 5,
    ...input.initialTaskId !== void 0 ? { initialTaskId: input.initialTaskId } : {}
  };
  id(meta.sessionId, "sessionId");
  string(meta.goal, 2e3, "goal");
  minutes(meta.minutes);
  let state = emptyState();
  let used = false;
  function now(current = state) {
    const at = clock();
    string(at, 32, "clock");
    const value = instant(at);
    if (current.history.length && value < instant(current.history.at(-1).at))
      fail("Clock moved backwards");
    if (pack.sources.some((source) => source.checkedAt !== null && instant(source.checkedAt) > value))
      fail("Source checkedAt is in the future");
    return at;
  }
  now();
  function scope(metadata) {
    return {
      tenantId: "local-pack:" + pack.id,
      learnerId: "local-session:" + metadata.sessionId,
      competencyId: entry.skillId,
      competencyVersion: entry.skillVersion,
      rubricVersion: entry.rubricVersion,
      dimension: "conceptual"
    };
  }
  function pending(current) {
    const turn = current.turns.at(-1);
    return turn && !turn.answer ? turn : void 0;
  }
  function choose(current, metadata) {
    if (pending(current) || current.turns.length >= Math.ceil(metadata.minutes / 2))
      return void 0;
    const last = current.turns.at(-1);
    if (!last && metadata.initialTaskId !== void 0)
      return eligible.find((task) => task.id === metadata.initialTaskId);
    if (last?.task.kind === "check" && last.answer?.correct)
      return void 0;
    const unserved = eligible.filter((task) => !current.turns.some((turn) => turn.task.id === task.id));
    const preferred = !last ? "diagnostic" : last.answer?.correct && (last.task.kind !== "diagnostic" || last.answer.assistance === "none") ? "check" : "practice";
    return unserved.find((task) => task.kind === preferred) ?? unserved[0];
  }
  function projection(current, metadata, at) {
    const binding = scope(metadata);
    return projectLearnerState(binding, {
      binding: { tenantId: binding.tenantId, learnerId: binding.learnerId },
      revision: current.observations.length,
      observations: current.observations
    }, at);
  }
  function progress(current, metadata, at) {
    const projected = projection(current, metadata, at);
    const answered = current.turns.flatMap((turn) => turn.answer ? [turn.answer] : []);
    return immutable({
      status: answered.length ? "provisional" : "unassessed",
      level: null,
      attempted: answered.length,
      correct: answered.filter((answer) => answer.correct).length,
      assisted: answered.filter((answer) => answer.assistance !== "none").length,
      complete: eligible.length > 0 && !pending(current) && !choose(current, metadata),
      canClaimDurableCompetence: false,
      recommendation: recommendLearningAction(projected.report, { missingPrerequisite: answered.at(-1)?.correct === false }),
      evidence: projected.report,
      review: scheduleReview(projected, at)
    });
  }
  function assistance(turn) {
    return turn.example ? "worked_example" : turn.hints ? "hint" : "none";
  }
  function view(current, metadata, at) {
    const turn = current.turns.at(-1);
    if (!turn)
      return fail("No question to render");
    const references = /* @__PURE__ */ new Set([...turn.task.sourceIds, ...turn.example ? entry.sourceIds : []]);
    return immutable({
      kind: turn.answer ? "feedback" : "question",
      turnId: turn.id,
      taskId: turn.task.id,
      phase: turn.task.kind,
      title: entry.title,
      objective: metadata.goal,
      prompt: turn.task.prompt,
      choices: turn.task.choices,
      explanation: turn.answer ? turn.task.explanation : turn.example ? entry.explanation : null,
      feedback: turn.answer ? {
        correct: turn.answer.correct,
        choiceId: turn.answer.choiceId,
        text: turn.answer.correct ? "That matches the authored answer." : "Review the explanation, then try a fresh question."
      } : null,
      hints: turn.task.hints.slice(0, turn.hints),
      hintsRemaining: turn.task.hints.length - turn.hints,
      assistance: assistance(turn),
      sources: pack.sources.filter((source) => selected.has(source.id) && references.has(source.id)),
      progress: progress(current, metadata, at)
    });
  }
  function terminal(current, metadata, at) {
    const unavailable = eligible.length === 0;
    const references = /* @__PURE__ */ new Set([...entry.sourceIds, ...current.turns.flatMap((turn) => turn.task.sourceIds)]);
    return immutable({
      kind: unavailable ? "needs_content" : "complete",
      turnId: null,
      taskId: null,
      phase: unavailable ? "unavailable" : "complete",
      title: entry.title,
      objective: metadata.goal,
      prompt: unavailable ? "No authored practice task matches the selected sources. Read the available material or choose another source." : "This practice session is finished. These local results do not establish mastery or long-term retention.",
      choices: [],
      explanation: null,
      feedback: null,
      hints: [],
      hintsRemaining: 0,
      assistance: "none",
      sources: pack.sources.filter((source) => selected.has(source.id) && references.has(source.id)),
      progress: progress(current, metadata, at)
    });
  }
  function apply(current, event, metadata, ceiling) {
    validateEvent(event);
    if (current.history.length >= LESSON_LIMITS.history)
      fail("Lesson history limit reached");
    if (instant(event.at) > instant(ceiling) || current.history.length && instant(event.at) < instant(current.history.at(-1).at))
      fail("Invalid event chronology");
    const requestId = eventId(event);
    if (requestId !== null && current.receipts.has(requestId))
      fail("Repeated request in checkpoint history");
    const draft = {
      history: [...current.history, immutable(event)],
      turns: [...current.turns],
      observations: [...current.observations],
      receipts: new Map(current.receipts),
      view: null
    };
    const localScope = scope(metadata);
    const expose = (turn, activity) => {
      draft.observations.push({
        id: canonical([metadata.sessionId, draft.history.length, activity]),
        type: "exposure",
        scope: localScope,
        at: event.at,
        activity,
        taskFamilyId: canonical([pack.id, pack.version, turn.task.familyId]),
        contextId: canonical([pack.id, pack.version, entry.id, turn.task.id, turn.task.version])
      });
    };
    if (event.kind === "question") {
      const task = choose(current, metadata);
      if (!task || task.id !== event.taskId || current.turns.some((turn2) => turn2.id === event.turnId))
        fail("Invalid question sequence");
      const recommendation = progress(current, metadata, event.at).recommendation;
      const example = supporting(entry.sourceIds) && (recommendation.action === "worked_example" || current.turns.length === 0 && task.kind === "practice");
      const turn = { id: event.turnId, task, example, hints: 0, answer: null };
      draft.turns.push(turn);
      expose(turn, "task_viewed");
      if (example)
        expose(turn, "worked_example_viewed");
    } else if (event.kind === "complete" || event.kind === "unavailable") {
      if (pending(current) || choose(current, metadata) || current.view?.kind === "complete" || current.view?.kind === "needs_content" || event.kind === "unavailable" !== (eligible.length === 0))
        fail("Invalid terminal sequence");
      draft.view = terminal(draft, metadata, event.at);
      return draft;
    } else {
      const turn = pending(current);
      if (!turn || turn.id !== event.turnId)
        fail("Stale or unknown turn");
      if (event.kind === "hint") {
        if (turn.hints >= turn.task.hints.length)
          fail("No more authored hints");
        draft.turns[draft.turns.length - 1] = { ...turn, hints: turn.hints + 1 };
        expose(turn, "hint_requested");
      } else {
        if (!turn.task.choices.some((choice) => choice.id === event.choiceId))
          fail("Unknown choice");
        const correct = event.choiceId === turn.task.correctChoiceId;
        draft.turns[draft.turns.length - 1] = { ...turn, answer: { choiceId: event.choiceId, correct, assistance: assistance(turn) } };
        const { tenantId: ignored, ...evidenceScope } = localScope;
        const attempt = canonical([pack.id, pack.version, turn.task.id, turn.task.version, metadata.sessionId, turn.id]);
        draft.observations.push({
          id: "performance:" + attempt,
          type: "performance",
          scope: localScope,
          at: event.at,
          evidence: {
            ...evidenceScope,
            id: "evidence:" + attempt,
            attemptId: attempt,
            sessionId: metadata.sessionId,
            taskFamilyId: canonical([pack.id, pack.version, turn.task.familyId]),
            contextId: canonical([pack.id, pack.version, entry.id, turn.task.id, turn.task.version]),
            at: event.at,
            kind: turn.task.kind === "diagnostic" ? "diagnostic" : "practice",
            score: correct ? 1 : 0,
            assistance: assistance(turn),
            assessment: "provisional",
            assessor: "deterministic",
            artifactRef: "local-practice:" + encodeURIComponent(attempt)
          }
        });
        expose(turn, "explanation_provided");
      }
    }
    draft.view = view(draft, metadata, event.at);
    if (requestId !== null)
      draft.receipts.set(requestId, { input: eventInput(event), view: draft.view });
    return draft;
  }
  function retry(requestId, payload) {
    const receipt = state.receipts.get(requestId);
    if (!receipt)
      return null;
    if (receipt.input !== canonical(payload))
      return fail("Request ID conflict");
    return receipt.view;
  }
  function checkpoint() {
    return immutable({
      schemaVersion: "lesson-checkpoint-v1",
      trust: "local-provisional",
      packId: pack.id,
      packVersion: pack.version,
      packCanonical,
      sessionId: meta.sessionId,
      entryId: entry.id,
      sourceIds,
      goal: meta.goal,
      minutes: meta.minutes,
      ...meta.initialTaskId !== void 0 ? { initialTaskId: meta.initialTaskId } : {},
      history: state.history
    });
  }
  return Object.freeze({
    get sessionId() {
      return meta.sessionId;
    },
    entryId: entry.id,
    supportedFormat: "text/choice",
    async next() {
      if (state.view?.kind === "complete" || state.view?.kind === "needs_content") {
        used = true;
        return state.view;
      }
      if (pending(state)) {
        used = true;
        return state.view;
      }
      const at = now();
      const task = choose(state, meta);
      if (!task) {
        state = apply(state, { kind: eligible.length ? "complete" : "unavailable", at }, meta, at);
        used = true;
        return state.view;
      }
      let turnId;
      for (let attempt = 0; attempt <= LESSON_LIMITS.history; attempt++) {
        const candidate = newId();
        id(candidate, "newId");
        if (!state.turns.some((turn) => turn.id === candidate)) {
          turnId = candidate;
          break;
        }
      }
      if (turnId === void 0)
        return fail("newId did not produce a unique turn ID");
      state = apply(state, { kind: "question", turnId, taskId: task.id, at }, meta, at);
      used = true;
      return state.view;
    },
    async answer(answer) {
      object(answer, ["turnId", "responseId", "choiceId"], "answer");
      id(answer.turnId, "turnId");
      id(answer.responseId, "responseId");
      id(answer.choiceId, "choiceId");
      const payload = { kind: "answer", ...answer };
      const previous = retry(answer.responseId, payload);
      if (previous)
        return previous;
      const event = { ...payload, at: now() };
      state = apply(state, event, meta, event.at);
      used = true;
      return state.view;
    },
    async help(request) {
      object(request, ["turnId", "requestId"], "help request");
      id(request.turnId, "turnId");
      id(request.requestId, "requestId");
      const payload = { kind: "hint", ...request };
      const previous = retry(request.requestId, payload);
      if (previous)
        return previous;
      const event = { ...payload, at: now() };
      state = apply(state, event, meta, event.at);
      used = true;
      return state.view;
    },
    async progress() {
      const result = progress(state, meta, now());
      used = true;
      return result;
    },
    async checkpoint() {
      const result = checkpoint();
      used = true;
      return result;
    },
    async restore(saved) {
      if (used)
        return fail("Restore requires a fresh lesson session");
      object(saved, ["schemaVersion", "trust", "packId", "packVersion", "packCanonical", "sessionId", "entryId", "sourceIds", "goal", "minutes", "initialTaskId", "history"], "checkpoint");
      if (saved.schemaVersion !== "lesson-checkpoint-v1" || saved.trust !== "local-provisional")
        fail("Unsupported lesson checkpoint");
      if (saved.packId !== pack.id || saved.packVersion !== pack.version || saved.packCanonical !== packCanonical)
        fail("Checkpoint pack content/version mismatch");
      if (saved.entryId !== entry.id)
        fail("Checkpoint entry mismatch");
      ids(saved.sourceIds, 0, LESSON_LIMITS.sources, "checkpoint.sourceIds");
      if (canonical([...saved.sourceIds].sort()) !== canonical(sourceIds))
        fail("Checkpoint source filter mismatch");
      id(saved.sessionId, "checkpoint.sessionId");
      string(saved.goal, 2e3, "checkpoint.goal");
      minutes(saved.minutes);
      if (saved.initialTaskId !== void 0) {
        id(saved.initialTaskId, "checkpoint.initialTaskId");
        if (!eligible.some((task) => task.id === saved.initialTaskId))
          fail("Checkpoint initial task is not eligible");
      }
      if (constraints.sessionId !== void 0 && constraints.sessionId !== saved.sessionId || constraints.goal !== void 0 && constraints.goal !== saved.goal || constraints.minutes !== void 0 && constraints.minutes !== saved.minutes || constraints.initialTaskId !== void 0 && constraints.initialTaskId !== saved.initialTaskId)
        fail("Checkpoint options mismatch");
      array(saved.history, 0, LESSON_LIMITS.history, "checkpoint.history");
      saved.history.forEach(validateEvent);
      if (canonical(saved).length > LESSON_LIMITS.checkpointCharacters)
        fail("Checkpoint is too large");
      const restored = {
        sessionId: saved.sessionId,
        goal: saved.goal,
        minutes: saved.minutes,
        ...saved.initialTaskId !== void 0 ? { initialTaskId: saved.initialTaskId } : {}
      };
      const at = now();
      let candidate = emptyState();
      for (const event of saved.history)
        candidate = apply(candidate, event, restored, at);
      state = candidate;
      meta = restored;
      used = true;
      return state.view;
    }
  });
}

// src/engine/contracts.ts
import { createHash } from "node:crypto";
var LessonEngineError = class extends Error {
  code;
  constructor(code, message = code) {
    super(message);
    this.name = "LessonEngineError";
    this.code = code;
  }
};
function reject(code, message) {
  throw new LessonEngineError(code, message);
}
function number(value, label, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    reject("invalid_request", "Invalid " + label);
}
function windowHours(value) {
  if (![24, 168, 720].includes(value))
    reject("invalid_request", "Invalid freshness window");
}
function validateBinding(value) {
  object(value, ["issuer", "tenantId", "learnerId", "productId"], "engine binding");
  for (const key of ["issuer", "tenantId", "learnerId", "productId"])
    string(value[key], 512, "binding." + key);
  return immutable(value);
}
function assertOwner(actual, expected) {
  if (canonical(validateBinding(actual)) !== canonical(expected))
    reject("forbidden", "Engine owner mismatch");
}
function digest(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function scopeKey(binding) {
  return "scope:" + digest(binding);
}
function timestamp3(value, label) {
  string(value, 32, label);
  instant(value);
}
function validateCommand(value) {
  object(value, ["protocolVersion", "operation", "requestId", "sessionId", "expectedRevision", "packId", "packVersion", "entryId", "sourceIds", "goal", "minutes", "windowHours", "answer", "help"], "engine command");
  if (value.protocolVersion !== "lesson-engine-v1")
    reject("invalid_request", "Unsupported engine protocol");
  id(value.requestId, "requestId");
  const base = ["protocolVersion", "operation", "requestId"];
  if (value.operation === "start") {
    object(value, [...base, "packId", "packVersion", "entryId", "sourceIds", "goal", "minutes", "windowHours"], "start command");
    id(value.packId, "packId");
    id(value.packVersion, "packVersion");
    id(value.entryId, "entryId");
    if (value.sourceIds !== void 0)
      ids(value.sourceIds, 0, 24, "sourceIds");
    if (value.goal !== void 0)
      string(value.goal, 2e3, "goal");
    if (value.minutes !== void 0)
      number(value.minutes, "minutes", 1, 60);
    if (value.windowHours !== void 0)
      windowHours(value.windowHours);
  } else {
    id(value.sessionId, "sessionId");
    if (value.operation === "resume" || value.operation === "progress") {
      object(value, [...base, "sessionId"], "read command");
    } else {
      number(value.expectedRevision, "expectedRevision");
      const mutation = [...base, "sessionId", "expectedRevision"];
      if (value.operation === "next" || value.operation === "cancel")
        object(value, mutation, "mutation command");
      else if (value.operation === "refresh") {
        object(value, [...mutation, "windowHours"], "refresh command");
        if (value.windowHours !== void 0)
          windowHours(value.windowHours);
      } else if (value.operation === "answer") {
        object(value, [...mutation, "answer"], "answer command");
        object(value.answer, ["turnId", "choiceId"], "answer");
        id(value.answer.turnId, "turnId");
        id(value.answer.choiceId, "choiceId");
      } else if (value.operation === "help") {
        object(value, [...mutation, "help"], "help command");
        object(value.help, ["turnId"], "help");
        id(value.help.turnId, "turnId");
      } else
        reject("invalid_request", "Unknown engine operation");
    }
  }
  if (canonical(value).length > 16384)
    reject("invalid_request", "Engine command too large");
  return immutable(value);
}
function validateContextSummary(input, now) {
  object(input, ["revision", "asOf", "reason", "initialTaskId"], "context summary");
  id(input.revision, "context.revision");
  timestamp3(input.asOf, "context.asOf");
  string(input.reason, 1e3, "context.reason");
  if (instant(input.asOf) > instant(now))
    reject("invalid_request", "Future learner context");
  if (input.initialTaskId !== void 0)
    id(input.initialTaskId, "context.initialTaskId");
  return immutable(input);
}
function validateStoredSession(input, owner, sessionId, now) {
  object(input, ["schemaVersion", "binding", "sessionId", "scopeKey", "storeVersion", "revision", "sequence", "pack", "entryId", "sourceIds", "windowHours", "status", "checkpoint", "context", "freshness", "createdAt", "updatedAt"], "stored session");
  if (input.schemaVersion !== "lesson-engine-session-v1" || input.sessionId !== sessionId || input.scopeKey !== scopeKey(owner))
    reject("host_failure", "Stored session binding is invalid");
  assertOwner(input.binding, owner);
  number(input.storeVersion, "storeVersion");
  number(input.revision, "revision");
  number(input.sequence, "sequence");
  if (input.revision > input.storeVersion || input.sequence !== input.storeVersion)
    reject("host_failure", "Stored session revision is invalid");
  object(input.pack, ["id", "version", "contentDigest"], "pinned pack");
  id(input.pack.id, "pack.id");
  id(input.pack.version, "pack.version");
  if (typeof input.pack.contentDigest !== "string" || !/^[a-f0-9]{64}$/.test(input.pack.contentDigest))
    reject("host_failure", "Stored pack digest is invalid");
  id(input.entryId, "entryId");
  ids(input.sourceIds, 0, 24, "sourceIds");
  windowHours(input.windowHours);
  if (input.status !== "active" && input.status !== "cancelled")
    reject("host_failure", "Stored status is invalid");
  timestamp3(input.createdAt, "createdAt");
  timestamp3(input.updatedAt, "updatedAt");
  if (instant(input.createdAt) > instant(input.updatedAt) || instant(input.updatedAt) > instant(now))
    reject("host_failure", "Stored session chronology is invalid");
  validateContextSummary(input.context, now);
  return immutable(input);
}
function engineError(error) {
  return error instanceof LessonEngineError ? error : error instanceof LearningContractError ? new LessonEngineError("invalid_request", error.message) : new LessonEngineError("host_failure", "Engine host operation failed");
}

// src/engine/engine.ts
function budget(timeoutMs, parent) {
  const controller = new AbortController();
  const deadlineAt = Date.now() + timeoutMs;
  let reason = "cancelled";
  const abort = (code) => {
    if (!controller.signal.aborted) {
      reason = code;
      controller.abort();
    }
  };
  const fromParent = () => abort("cancelled");
  if (parent?.aborted)
    fromParent();
  else
    parent?.addEventListener("abort", fromParent, { once: true });
  const timer = setTimeout(() => abort("timeout"), timeoutMs);
  const active = () => {
    if (Date.now() >= deadlineAt)
      abort("timeout");
    if (controller.signal.aborted)
      reject(reason, reason === "timeout" ? "Engine operation deadline exceeded" : "Engine operation cancelled");
  };
  const interrupted = new Promise((_, fail2) => {
    const notify = () => fail2(new LessonEngineError(reason, "Engine operation interrupted"));
    if (controller.signal.aborted)
      notify();
    else
      controller.signal.addEventListener("abort", notify, { once: true });
  });
  void interrupted.catch(() => void 0);
  return {
    signal: controller.signal,
    deadlineAt,
    active,
    async run(work) {
      active();
      const result = await Promise.race([Promise.resolve().then(() => {
        active();
        return work();
      }), interrupted]);
      active();
      return result;
    },
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", fromParent);
      abort("cancelled");
    }
  };
}
function createLessonEngine(options) {
  object(options, ["authorize", "loadPack", "context", "store", "refresh", "sourcePolicy", "operationTimeoutMs", "clock", "newId"], "engine options");
  if ([options.authorize, options.loadPack, options.context].some((callback) => typeof callback !== "function") || !options.store || [options.store.readSession, options.store.readReceipt, options.store.commit].some((callback) => typeof callback !== "function"))
    reject("invalid_request", "Engine authorization, context, pack and store ports are required");
  for (const callback of [options.refresh, options.clock, options.newId])
    if (callback !== void 0 && typeof callback !== "function")
      reject("invalid_request", "Invalid engine callback");
  if (options.operationTimeoutMs !== void 0)
    number(options.operationTimeoutMs, "operationTimeoutMs", 1, 12e4);
  if (options.sourcePolicy !== void 0)
    object(options.sourcePolicy, ["required", "maxCheckAgeMs", "timeoutMs"], "source policy");
  const operationTimeoutMs = options.operationTimeoutMs ?? 15e3;
  number(operationTimeoutMs, "operationTimeoutMs", 1, 12e4);
  const sourcePolicy = immutable(options.sourcePolicy ?? { required: false, maxCheckAgeMs: 864e5, timeoutMs: 5e3 });
  object(sourcePolicy, ["required", "maxCheckAgeMs", "timeoutMs"], "source policy");
  if (typeof sourcePolicy.required !== "boolean")
    reject("invalid_request", "Invalid source policy");
  number(sourcePolicy.maxCheckAgeMs, "maxCheckAgeMs", 1, 31536e6);
  number(sourcePolicy.timeoutMs, "source timeout", 1, 12e4);
  const authorizePort = options.authorize;
  const loadPackPort = options.loadPack;
  const contextPort = options.context;
  const refreshPort = options.refresh;
  const readSession = options.store.readSession.bind(options.store);
  const readReceipt = options.store.readReceipt.bind(options.store);
  const commit = options.store.commit.bind(options.store);
  const clock = options.clock ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const newId = options.newId ?? randomUUID;
  const now = () => {
    const value = clock();
    timestamp3(value, "clock");
    return value;
  };
  now();
  async function execute(rawBinding, rawCommand, signal) {
    const operation = budget(operationTimeoutMs, signal);
    try {
      const binding = validateBinding(rawBinding);
      const command = validateCommand(rawCommand);
      const commandCanonical = canonical(command);
      const io = operation.run;
      const ownerScopeKey = scopeKey(binding);
      const authorize = async (resource) => {
        const request2 = immutable({
          binding,
          operation: command.operation,
          pack: { id: resource.pack.id, version: resource.pack.version },
          entryId: resource.entryId,
          sessionId: resource.sessionId
        });
        if (await io(() => authorizePort(request2, operation.signal)) !== true)
          reject("forbidden", "Lesson operation not authorized");
      };
      const stored = async (sessionId) => {
        const value = await io(() => readSession(binding, sessionId, operation.signal));
        if (!value)
          return reject("not_found", "Lesson session not found");
        return validateStoredSession(value, binding, sessionId, now());
      };
      const packFor = async (ref, expected) => {
        const pack2 = validateLearningPack(await io(() => loadPackPort(binding, ref, operation.signal)));
        if (pack2.id !== ref.id || pack2.version !== ref.version || expected && digest(pack2) !== expected.contentDigest)
          reject("conflict", "Pinned pack content/version changed");
        return pack2;
      };
      const sourceRequest = (pack2, sourceIds, windowHours2) => immutable({ sources: pack2.sources.filter((source) => sourceIds.includes(source.id)).map(({ id: id2, version, url }) => ({ id: id2, version, url })), windowHours: windowHours2, maxCheckAgeMs: sourcePolicy.maxCheckAgeMs });
      const normalize = (report, request2) => report === null ? null : validateFreshnessReport({ ...report, maxCheckAgeMs: sourcePolicy.maxCheckAgeMs }, { ...request2, now: now() });
      const refresh = async (request2) => {
        if (!refreshPort)
          return createUnavailableFreshnessReport(request2, { now: now(), outcome: "offline", detail: "refresh_not_configured" });
        const limit = budget(Math.min(sourcePolicy.timeoutMs, Math.max(1, operation.deadlineAt - Date.now())), operation.signal);
        let report;
        try {
          report = await limit.run(() => refreshPort(request2, limit.signal));
        } catch (error) {
          operation.active();
          if (error instanceof LessonEngineError && error.code === "forbidden")
            throw error;
          const timedOut = error instanceof LessonEngineError && error.code === "timeout";
          report = createUnavailableFreshnessReport(request2, { now: now(), outcome: timedOut ? "timeout" : "error", detail: timedOut ? "refresh_timeout" : "refresh_failed" });
        } finally {
          limit.dispose();
        }
        operation.active();
        return validateFreshnessReport(report, { ...request2, now: now() });
      };
      const context = async (pack2, entryId, sourceIds) => {
        let value;
        try {
          value = await io(() => contextPort(immutable({ binding, pack: pack2, entryId, sourceIds }), operation.signal));
        } catch (error) {
          operation.active();
          if (error instanceof LessonEngineError && ["forbidden", "cancelled", "timeout"].includes(error.code))
            throw error;
          return immutable({ revision: "unknown:unavailable", asOf: now(), reason: "Learner context was unavailable; starting with an unassessed entry activity." });
        }
        if (value === null)
          return immutable({ revision: "unknown:empty", asOf: now(), reason: "No relevant learner context is available; starting with an unassessed entry activity." });
        object(value, ["binding", "revision", "asOf", "reason", "initialTaskId"], "learner context");
        assertOwner(value.binding, binding);
        const { binding: ignored, ...summary } = value;
        return validateContextSummary(summary, now());
      };
      const hydrate = async (record, pack2) => {
        if (record.checkpoint.sessionId !== record.sessionId || record.checkpoint.entryId !== record.entryId || record.checkpoint.packId !== record.pack.id || record.checkpoint.packVersion !== record.pack.version || canonical(record.checkpoint.sourceIds) !== canonical(record.sourceIds) || record.checkpoint.initialTaskId !== record.context.initialTaskId)
          reject("host_failure", "Stored lesson/context binding is invalid");
        const lesson = createLessonSession({
          pack: pack2,
          entryId: record.entryId,
          sourceIds: record.sourceIds,
          sessionId: record.sessionId,
          clock,
          newId
        });
        const view2 = await io(() => lesson.restore(record.checkpoint));
        return { lesson, view: view2, progress: await io(() => lesson.progress()) };
      };
      const reply = (record, view2, progress2, freshness = record.freshness) => immutable({
        protocolVersion: "lesson-engine-v1",
        requestId: command.requestId,
        sessionId: record.sessionId,
        revision: record.revision,
        sequence: record.sequence,
        scopeKey: record.scopeKey,
        pack: record.pack,
        entryId: record.entryId,
        sourceIds: record.sourceIds,
        status: record.status,
        view: view2 === null ? null : { ...view2, progress: progress2 },
        progress: progress2,
        context: record.context,
        freshness
      });
      const receiptFor = async (current2) => {
        const receipt = await io(() => readReceipt(binding, command.requestId, operation.signal));
        if (!receipt)
          return null;
        object(receipt, ["binding", "requestId", "commandCanonical", "sessionId", "reply"], "command receipt");
        assertOwner(receipt.binding, binding);
        if (receipt.requestId !== command.requestId || receipt.commandCanonical !== commandCanonical)
          reject("conflict", "Request ID reused for a different command");
        const record = current2 ?? await stored(receipt.sessionId);
        if (record.sessionId !== receipt.sessionId || receipt.reply.sessionId !== record.sessionId || receipt.reply.scopeKey !== ownerScopeKey || canonical(receipt.reply.pack) !== canonical(record.pack) || receipt.reply.requestId !== command.requestId)
          reject("host_failure", "Stored receipt binding is invalid");
        await authorize(record);
        operation.active();
        return immutable(receipt.reply);
      };
      const commitRecord = async (record, expectedStoreVersion, output, requiredSources) => {
        await authorize(record);
        operation.active();
        let deadlineAt = operation.deadlineAt;
        if (requiredSources) {
          const checked2 = record.freshness && validateFreshnessReport(record.freshness, { ...requiredSources, now: now() });
          if (!checked2 || !meetsCurrentSourcePolicy(checked2))
            reject("source_required", "Required source verification expired before commit");
          const remaining = Math.min(...checked2.sources.map((source) => instant(source.lastSuccessfulCheckAt) + requiredSources.maxCheckAgeMs - instant(now())));
          deadlineAt = Math.min(deadlineAt, Date.now() + Math.max(0, remaining));
        }
        const receipt = immutable({ binding, requestId: command.requestId, commandCanonical, sessionId: record.sessionId, reply: output });
        const result = await io(() => commit({ binding, expectedStoreVersion, session: record, receipt, deadlineAt }, operation.signal));
        if (result === "committed") {
          await authorize(record);
          operation.active();
        }
        return result;
      };
      if (command.operation === "start") {
        const ref = { id: command.packId, version: command.packVersion };
        await authorize({ pack: ref, entryId: command.entryId, sessionId: null });
        const previous = await receiptFor();
        if (previous)
          return previous;
        const pack2 = await packFor(ref);
        const entry = pack2.entries.find((candidate) => candidate.id === command.entryId);
        if (!entry)
          reject("invalid_request", "Unknown lesson entry");
        const sourceIds = [...command.sourceIds ?? pack2.sources.map((source) => source.id)].sort();
        ids(sourceIds, 0, 24, "sourceIds");
        if (sourceIds.some((source) => !pack2.sources.some((candidate) => candidate.id === source)))
          reject("invalid_request", "Unknown source filter");
        const window2 = command.windowHours ?? 168;
        const request2 = sourceRequest(pack2, sourceIds, window2);
        const [placement, checked2] = await Promise.all([context(pack2, command.entryId, sourceIds), sourcePolicy.required ? refresh(request2) : Promise.resolve(null)]);
        let freshness = checked2 === null ? null : validateFreshnessReport(checked2, { ...request2, now: now() });
        if (sourcePolicy.required && (!freshness || !meetsCurrentSourcePolicy(freshness)))
          reject("source_required", "Required current sources could not be verified against the approved baseline");
        const sessionId = newId();
        id(sessionId, "sessionId");
        const lesson = createLessonSession({
          pack: pack2,
          entryId: command.entryId,
          sourceIds,
          sessionId,
          clock,
          newId,
          ...command.goal !== void 0 ? { goal: command.goal } : {},
          ...command.minutes !== void 0 ? { minutes: command.minutes } : {},
          ...placement.initialTaskId !== void 0 ? { initialTaskId: placement.initialTaskId } : {}
        });
        const view2 = await io(() => lesson.next());
        const progress2 = await io(() => lesson.progress());
        const checkpoint2 = await io(() => lesson.checkpoint());
        const at = now();
        if (freshness)
          freshness = validateFreshnessReport(freshness, { ...request2, now: at });
        if (sourcePolicy.required && (!freshness || !meetsCurrentSourcePolicy(freshness)))
          reject("source_required", "Required source verification expired before release");
        const record = immutable({
          schemaVersion: "lesson-engine-session-v1",
          binding,
          sessionId,
          scopeKey: ownerScopeKey,
          storeVersion: 1,
          revision: 1,
          sequence: 1,
          pack: { ...ref, contentDigest: digest(pack2) },
          entryId: command.entryId,
          sourceIds,
          windowHours: window2,
          status: "active",
          checkpoint: checkpoint2,
          context: placement,
          freshness,
          createdAt: at,
          updatedAt: at
        });
        const output = reply(record, view2, progress2);
        if (await commitRecord(record, null, output, sourcePolicy.required ? request2 : void 0) === "committed")
          return output;
        const duplicate = await receiptFor();
        if (duplicate)
          return duplicate;
        return reject("conflict", "Session creation conflicted");
      }
      let current = await stored(command.sessionId);
      await authorize(current);
      const readonly = command.operation === "resume" || command.operation === "progress";
      if (!readonly) {
        const previous = await receiptFor(current);
        if (previous)
          return previous;
      }
      const pack = await packFor(current.pack, current.pack);
      const hydrated = await hydrate(current, pack);
      const request = sourceRequest(pack, current.sourceIds, current.windowHours);
      if (readonly) {
        const freshness = normalize(current.freshness, request);
        await authorize(current);
        operation.active();
        return reply(current, hydrated.view, hydrated.progress, freshness);
      }
      if (current.status === "cancelled")
        reject("cancelled", "Lesson session is cancelled");
      if (current.revision !== command.expectedRevision)
        reject("conflict", "Lesson revision changed; resume before retrying");
      const original = current;
      let checkpoint = current.checkpoint;
      let view = hydrated.view;
      let progress = hydrated.progress;
      let checked = null;
      const window = command.operation === "refresh" ? command.windowHours ?? current.windowHours : current.windowHours;
      if (command.operation === "refresh")
        checked = await refresh(sourceRequest(pack, current.sourceIds, window));
      else if (command.operation === "next")
        view = await io(() => hydrated.lesson.next());
      else if (command.operation === "answer")
        view = await io(() => hydrated.lesson.answer({ ...command.answer, responseId: command.requestId }));
      else if (command.operation === "help")
        view = await io(() => hydrated.lesson.help({ ...command.help, requestId: command.requestId }));
      if (command.operation !== "refresh") {
        checkpoint = await io(() => hydrated.lesson.checkpoint());
        progress = await io(() => hydrated.lesson.progress());
      }
      const lessonChanged = command.operation === "cancel" || canonical(checkpoint) !== canonical(original.checkpoint);
      const releasesQuestion = command.operation === "next" && checkpoint.history.length > original.checkpoint.history.length && checkpoint.history.at(-1)?.kind === "question";
      const freshnessIdentity = (report) => {
        if (report === null)
          return "null";
        const { evaluatedAt: ignored, sources, ...rest } = report;
        return canonical({ ...rest, sources: sources.map(({ snapshotFreshness: age, ...source }) => source) });
      };
      for (let attempt = 0; attempt < 4; attempt++) {
        operation.active();
        if (current.status === "cancelled")
          reject("cancelled", "Lesson session is cancelled");
        if (canonical(current.pack) !== canonical(original.pack) || canonical(current.sourceIds) !== canonical(original.sourceIds))
          reject("conflict", "Pinned lesson scope changed");
        if (command.operation !== "refresh" && current.revision !== command.expectedRevision)
          reject("conflict", "Lesson revision changed; resume before retrying");
        if (command.operation === "refresh") {
          if (freshnessIdentity(current.freshness) !== freshnessIdentity(original.freshness) || current.windowHours !== original.windowHours)
            reject("conflict", "A newer freshness update was committed");
          if (current.storeVersion !== original.storeVersion) {
            const latest = await hydrate(current, pack);
            view = latest.view;
            progress = latest.progress;
          }
          checkpoint = current.checkpoint;
        }
        const at = now();
        if (instant(at) < instant(current.updatedAt))
          reject("invalid_request", "Clock moved backwards");
        const freshness = command.operation === "refresh" ? validateFreshnessReport(checked, { ...sourceRequest(pack, current.sourceIds, window), now: at }) : normalize(current.freshness, sourceRequest(pack, current.sourceIds, current.windowHours));
        const next = immutable({
          ...current,
          storeVersion: current.storeVersion + 1,
          sequence: current.sequence + 1,
          revision: current.revision + (lessonChanged ? 1 : 0),
          status: command.operation === "cancel" ? "cancelled" : "active",
          checkpoint,
          freshness,
          windowHours: command.operation === "refresh" ? window : current.windowHours,
          updatedAt: at
        });
        const output = reply(next, view, progress);
        if (await commitRecord(next, current.storeVersion, output, sourcePolicy.required && releasesQuestion ? sourceRequest(pack, current.sourceIds, current.windowHours) : void 0) === "committed")
          return output;
        const duplicate = await receiptFor();
        if (duplicate)
          return duplicate;
        current = await stored(command.sessionId);
        await authorize(current);
      }
      return reject("conflict", "Concurrent lesson updates exceeded the retry budget");
    } catch (error) {
      throw engineError(error);
    } finally {
      operation.dispose();
    }
  }
  return Object.freeze({ execute });
}

// src/engine/store.ts
function createMemoryEngineStore(options = {}) {
  object(options, ["maxSessions", "maxReceipts", "maxCharacters"], "memory store options");
  if (options.maxSessions !== void 0)
    number(options.maxSessions, "maxSessions", 1, 1e4);
  if (options.maxReceipts !== void 0)
    number(options.maxReceipts, "maxReceipts", 1, 1e5);
  if (options.maxCharacters !== void 0)
    number(options.maxCharacters, "maxCharacters", 1024, 268435456);
  const maxSessions = options.maxSessions ?? 100;
  const maxReceipts = options.maxReceipts ?? 2e3;
  const maxCharacters = options.maxCharacters ?? 16777216;
  number(maxSessions, "maxSessions", 1, 1e4);
  number(maxReceipts, "maxReceipts", 1, 1e5);
  number(maxCharacters, "maxCharacters", 1024, 268435456);
  const sessions = /* @__PURE__ */ new Map();
  const receipts = /* @__PURE__ */ new Map();
  let characters = 0;
  const key = (binding, id2) => canonical([validateBinding(binding), id2]);
  const active = (signal, deadlineAt) => {
    if (signal.aborted)
      reject("cancelled", "Store operation cancelled");
    if (deadlineAt !== void 0 && Date.now() >= deadlineAt)
      reject("timeout", "Store deadline exceeded");
  };
  const store = {
    async readSession(binding, sessionId, signal) {
      active(signal);
      return sessions.get(key(binding, sessionId))?.value ?? null;
    },
    async readReceipt(binding, requestId, signal) {
      active(signal);
      return receipts.get(key(binding, requestId))?.value ?? null;
    },
    async commit(input, signal) {
      active(signal, input.deadlineAt);
      const binding = validateBinding(input.binding);
      assertOwner(input.session.binding, binding);
      assertOwner(input.receipt.binding, binding);
      if (input.receipt.sessionId !== input.session.sessionId || input.receipt.reply.sessionId !== input.session.sessionId)
        reject("host_failure", "Commit session/receipt mismatch");
      const sessionKey = key(binding, input.session.sessionId);
      const receiptKey = key(binding, input.receipt.requestId);
      const previous = sessions.get(sessionKey);
      if (receipts.has(receiptKey) || (previous?.value.storeVersion ?? null) !== input.expectedStoreVersion)
        return "conflict";
      if (input.session.storeVersion !== (previous?.value.storeVersion ?? 0) + 1 || input.session.sequence !== input.session.storeVersion)
        reject("host_failure", "Commit revision mismatch");
      const session = immutable(input.session);
      const receipt = immutable(input.receipt);
      const sessionSize = canonical(session).length;
      const receiptSize = canonical(receipt).length;
      const nextCharacters = characters - (previous?.size ?? 0) + sessionSize + receiptSize;
      if (!previous && sessions.size >= maxSessions || receipts.size >= maxReceipts || nextCharacters > maxCharacters)
        reject("capacity", "Memory store capacity reached; no data was evicted");
      active(signal, input.deadlineAt);
      sessions.set(sessionKey, { value: session, size: sessionSize });
      receipts.set(receiptKey, { value: receipt, size: receiptSize });
      characters = nextCharacters;
      return "committed";
    }
  };
  return Object.freeze(store);
}

// src/engine/context.ts
function createEvidenceContextProvider(options) {
  if (typeof options.read !== "function")
    throw new LearningContractError("An evidence reader is required");
  const read = options.read;
  const clock = options.clock ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  return async (request, signal) => {
    signal.throwIfAborted();
    const entry = request.pack.entries.find((value) => value.id === request.entryId);
    if (!entry)
      throw new LearningContractError("Unknown context entry");
    const scope = {
      tenantId: request.binding.tenantId,
      learnerId: request.binding.learnerId,
      competencyId: entry.skillId,
      competencyVersion: entry.skillVersion,
      rubricVersion: entry.rubricVersion,
      dimension: "conceptual"
    };
    const result = await read(immutable({ binding: request.binding, scope, packId: request.pack.id, packVersion: request.pack.version }), signal);
    signal.throwIfAborted();
    if (result === null)
      return null;
    if (canonical(result.binding) !== canonical(request.binding))
      throw new LessonEngineError("forbidden", "Context owner mismatch");
    if (canonical(result).length > 512e3 || Object.keys(result).some((key) => !["binding", "revision", "asOf", "evidence"].includes(key)) || typeof result.revision !== "string" || !result.revision.trim() || result.revision.length > 128 || !Array.isArray(result.evidence?.observations) || result.evidence.observations.length > 256) {
      throw new LearningContractError("Invalid scoped evidence context");
    }
    const now = clock();
    if (instant(result.asOf) > instant(now))
      throw new LearningContractError("Future context snapshot");
    if (result.evidence.observations.some((observation) => instant(observation.at) > instant(result.asOf)))
      throw new LearningContractError("Observation postdates the context snapshot");
    const projection = projectLearnerState(scope, result.evidence, now);
    const selected = new Set(request.sourceIds);
    const tasks = entry.taskIds.map((id2) => request.pack.tasks.find((task2) => task2.id === id2)).filter((task2) => task2.sourceIds.some((id2) => selected.has(id2)));
    const status = projection.report.status;
    const phase = ["independent", "retained", "transfer_demonstrated"].includes(status) ? "check" : ["developing", "supported_performance"].includes(status) ? "practice" : "diagnostic";
    const task = tasks.find((task2) => task2.kind === phase && (phase !== "check" || !projection.seenTaskFamilies.some((family) => family === task2.familyId || family === canonical([request.pack.id, request.pack.version, task2.familyId]))));
    const reason = !task ? "The available evidence does not select a compatible authored branch; start with the entry question." : phase === "check" ? "Compatible prior evidence supports trying a new authored check. This session still records provisional practice." : phase === "practice" ? "Relevant prior practice suggests starting with the authored example and guided practice." : "There is insufficient current evidence for placement; start with the entry question.";
    return immutable({
      binding: request.binding,
      revision: result.revision,
      asOf: result.asOf,
      reason,
      ...task ? { initialTaskId: task.id } : {}
    });
  };
}

// src/engine-http/index.ts
import { randomUUID as randomUUID2 } from "node:crypto";
var errors = {
  invalid_request: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  cancelled: 409,
  timeout: 408,
  source_required: 412,
  capacity: 503,
  host_failure: 503,
  unauthenticated: 401,
  "origin-denied": 403,
  "request-too-large": 413,
  "json-required": 415
};
var HttpError = class extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
  code;
};
var headers = { "cache-control": "no-store", "x-content-type-options": "nosniff", "vary": "Origin, Authorization" };
function errorCode(error) {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  return typeof code === "string" && Object.hasOwn(errors, code) ? code : "host_failure";
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...headers, "content-type": "application/json; charset=utf-8" } });
}
async function body(request, signal) {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    throw new HttpError("json-required");
  const reader = request.body?.getReader();
  if (!reader)
    throw new HttpError("invalid_request");
  const cancel = () => {
    void reader.cancel().catch(() => {
    });
  };
  signal.addEventListener("abort", cancel, { once: true });
  let length = 0, content = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done)
        break;
      length += part.value.byteLength;
      if (length > 16384)
        throw new HttpError("request-too-large");
      content += decoder.decode(part.value, { stream: true });
    }
    content += decoder.decode();
    const command = JSON.parse(content);
    if (!command || typeof command !== "object" || Array.isArray(command) || typeof command.requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(command.requestId))
      throw new HttpError("invalid_request");
    return command;
  } catch (error) {
    if (error instanceof HttpError)
      throw error;
    throw new HttpError("invalid_request");
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}
function createLessonEngineHandler(options) {
  if (typeof options.authenticate !== "function" || typeof options.engine?.execute !== "function")
    throw new TypeError("Engine and authentication adapters are required");
  const authenticate = options.authenticate;
  const execute = options.engine.execute.bind(options.engine);
  const origin = new URL(options.origin);
  if (origin.origin !== options.origin || origin.username || origin.password || origin.protocol !== "https:" && !(origin.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(origin.hostname)))
    throw new TypeError("Use an exact HTTPS or loopback origin");
  const path = options.path ?? "/api/lessons";
  const timeoutMs = options.timeoutMs ?? 15e3;
  if (!/^\/[A-Za-z0-9/_-]+$/.test(path) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 20 || timeoutMs > 6e4)
    throw new TypeError("Invalid HTTP limits");
  return async (request) => {
    const url = new URL(request.url);
    if (url.origin !== origin.origin || url.pathname !== path || url.search || url.hash)
      return json({ error: "not_found" }, 404);
    const suppliedOrigin = request.headers.get("origin");
    if (suppliedOrigin !== null && suppliedOrigin !== origin.origin)
      return json({ error: "origin-denied" }, 403);
    if (request.method !== "POST")
      return json({ error: "invalid_request" }, 405);
    if (!/^Bearer [^\s]+$/.test(request.headers.get("authorization") ?? ""))
      return json({ error: "unauthenticated" }, 401);
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted)
      controller.abort();
    let rejectAbort = () => {
    };
    const interrupted = new Promise((_, reject2) => {
      rejectAbort = reject2;
    });
    const onAbort = () => rejectAbort(new HttpError("cancelled"));
    controller.signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      rejectAbort(new HttpError("timeout"));
      controller.abort();
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", abort);
      controller.signal.removeEventListener("abort", onAbort);
      controller.abort();
    };
    let streaming = false;
    try {
      controller.signal.throwIfAborted();
      const [binding, command] = await Promise.race([Promise.all([
        Promise.resolve().then(() => authenticate(request, controller.signal)).catch(() => {
          throw new HttpError("unauthenticated");
        }),
        body(request, controller.signal)
      ]), interrupted]);
      controller.signal.throwIfAborted();
      if (command.operation !== "start" || !request.headers.get("accept")?.includes("application/x-ndjson")) {
        const reply = await Promise.race([execute(binding, command, controller.signal), interrupted]);
        controller.signal.throwIfAborted();
        return json(reply);
      }
      streaming = true;
      const encoder = new TextEncoder();
      let closed = false;
      const stream = new ReadableStream({
        start(output) {
          let sequence = 0;
          const write = (type, payload = {}) => {
            controller.signal.throwIfAborted();
            if (closed)
              throw new HttpError("cancelled");
            output.enqueue(encoder.encode(JSON.stringify({ protocolVersion: "lesson-engine-stream-v1", requestId: command.requestId, sequence: ++sequence, type, ...payload }) + "\n"));
          };
          void (async () => {
            try {
              const ready = await Promise.race([execute(binding, command, controller.signal), interrupted]);
              write("lesson.ready", { reply: ready });
              if (ready.status === "active") {
                const current = await Promise.race([execute(binding, { protocolVersion: "lesson-engine-v1", operation: "resume", requestId: randomUUID2(), sessionId: ready.sessionId }, controller.signal), interrupted]);
                if (current.status === "active") {
                  const refreshed = await Promise.race([execute(binding, { protocolVersion: "lesson-engine-v1", operation: "refresh", requestId: randomUUID2(), sessionId: ready.sessionId, expectedRevision: current.revision }, controller.signal), interrupted]);
                  write("freshness.ready", { reply: refreshed });
                }
              }
              write("run.completed");
            } catch (error) {
              if (!closed) {
                try {
                  output.enqueue(encoder.encode(JSON.stringify({ protocolVersion: "lesson-engine-stream-v1", requestId: command.requestId, sequence: ++sequence, type: "run.error", error: errorCode(error) }) + "\n"));
                } catch {
                }
              }
            } finally {
              if (!closed) {
                closed = true;
                output.close();
              }
              cleanup();
            }
          })();
        },
        cancel() {
          closed = true;
          controller.abort();
          cleanup();
        }
      });
      return new Response(stream, { headers: { ...headers, "content-type": "application/x-ndjson; charset=utf-8", "x-accel-buffering": "no" } });
    } catch (error) {
      const code = errorCode(error);
      return json({ error: code }, errors[code] ?? 503);
    } finally {
      if (!streaming)
        cleanup();
    }
  };
}
export {
  LessonEngineError,
  createEvidenceContextProvider,
  createHttpFreshnessProvider,
  createLessonEngine,
  createLessonEngineHandler,
  createMemoryEngineStore,
  createUnavailableFreshnessReport,
  meetsCurrentSourcePolicy,
  validateFreshnessReport
};
