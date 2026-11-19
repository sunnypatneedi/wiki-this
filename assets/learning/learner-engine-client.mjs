/*! LearnerContextKit optional connected adapter. MIT (c) 2026 Sunny Patneedi. See LICENSE. */

// src/core/value.ts
var LearningContractError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LearningContractError";
  }
};
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

// src/engine-client/wire.ts
var fail2 = () => {
  throw new LearningContractError("Invalid Engine response");
};
function object2(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !fields.includes(key)))
    fail2();
}
function text(value, max = 2e3) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail2();
}
function id2(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value))
    fail2();
}
function count(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    fail2();
}
function progress(value) {
  object2(value, ["status", "level", "attempted", "correct", "assisted", "complete", "canClaimDurableCompetence", "recommendation", "evidence", "review"]);
  if (!["unassessed", "provisional"].includes(value.status) || value.level !== null || value.canClaimDurableCompetence !== false || typeof value.complete !== "boolean")
    fail2();
  for (const key of ["attempted", "correct", "assisted"])
    count(value[key]);
  if (value.correct > value.attempted || value.assisted > value.attempted || value.attempted > 200)
    fail2();
  if (!value.evidence || typeof value.evidence !== "object" || value.evidence.canClaimDurableCompetence !== false || !value.recommendation || !value.review)
    fail2();
}
function view(value, expectedProgress) {
  if (value === null)
    return;
  object2(value, ["kind", "turnId", "phase", "taskId", "title", "objective", "prompt", "choices", "explanation", "feedback", "hints", "hintsRemaining", "assistance", "sources", "progress"]);
  if (!["question", "feedback", "complete", "needs_content"].includes(value.kind) || !["diagnostic", "practice", "check", "complete", "unavailable"].includes(value.phase))
    fail2();
  if (value.turnId !== null)
    id2(value.turnId);
  if (value.taskId !== null)
    id2(value.taskId);
  text(value.title, 160);
  text(value.objective);
  text(value.prompt, 6e3);
  if (value.explanation !== null)
    text(value.explanation, 12e3);
  if (!Array.isArray(value.choices) || value.choices.length > 8 || !Array.isArray(value.hints) || value.hints.length > 5 || !Array.isArray(value.sources) || value.sources.length > 24)
    fail2();
  const seen = /* @__PURE__ */ new Set();
  for (const choice of value.choices) {
    object2(choice, ["id", "text"]);
    id2(choice.id);
    text(choice.text);
    if (seen.has(choice.id))
      fail2();
    seen.add(choice.id);
  }
  for (const hint of value.hints)
    text(hint);
  count(value.hintsRemaining);
  if (value.hintsRemaining > 5)
    fail2();
  if (!["none", "hint", "worked_example", "coauthored", "delegated", "unknown"].includes(value.assistance))
    fail2();
  if (value.feedback !== null) {
    object2(value.feedback, ["correct", "text", "choiceId"]);
    if (typeof value.feedback.correct !== "boolean")
      fail2();
    text(value.feedback.text, 6e3);
    id2(value.feedback.choiceId);
    if (!seen.has(value.feedback.choiceId))
      fail2();
  }
  const sourceIds = /* @__PURE__ */ new Set();
  for (const source of value.sources) {
    object2(source, ["id", "version", "title", "url", "content", "checkedAt"]);
    id2(source.id);
    id2(source.version);
    text(source.title, 160);
    text(source.content, 2e4);
    if (sourceIds.has(source.id))
      fail2();
    sourceIds.add(source.id);
    if (source.url !== null) {
      text(source.url, 2048);
      const url = new URL(source.url);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
        fail2();
    }
    if (source.checkedAt !== null)
      instant(source.checkedAt);
  }
  if (canonical(value.progress) !== canonical(expectedProgress))
    fail2();
  if (["question", "feedback"].includes(value.kind) && (!value.turnId || !value.taskId || value.choices.length < 2))
    fail2();
  if (value.kind === "feedback" !== (value.feedback !== null))
    fail2();
}
function validateEngineReply(input, expected) {
  if (canonical(input).length > 2 * 1024 * 1024)
    fail2();
  object2(input, ["protocolVersion", "requestId", "sessionId", "revision", "sequence", "scopeKey", "pack", "entryId", "sourceIds", "status", "view", "progress", "context", "freshness"]);
  if (input.protocolVersion !== "lesson-engine-v1" || input.requestId !== expected.requestId)
    fail2();
  id2(input.requestId);
  id2(input.sessionId);
  id2(input.entryId);
  text(input.scopeKey, 256);
  count(input.revision);
  count(input.sequence);
  object2(input.pack, ["id", "version", "contentDigest"]);
  id2(input.pack.id);
  id2(input.pack.version);
  if (!/^[a-f0-9]{64}$/.test(input.pack.contentDigest))
    fail2();
  if (input.pack.id !== expected.pack.id || input.pack.version !== expected.pack.version || input.entryId !== expected.entryId || expected.pack.contentDigest && input.pack.contentDigest !== expected.pack.contentDigest || expected.sessionId && input.sessionId !== expected.sessionId || expected.scopeKey && input.scopeKey !== expected.scopeKey)
    fail2();
  if (!Array.isArray(input.sourceIds) || input.sourceIds.length > 24 || new Set(input.sourceIds).size !== input.sourceIds.length)
    fail2();
  input.sourceIds.forEach(id2);
  if (expected.sourceIds && canonical([...input.sourceIds].sort()) !== canonical([...expected.sourceIds].sort()))
    fail2();
  if (!["active", "cancelled"].includes(input.status))
    fail2();
  progress(input.progress);
  view(input.view, input.progress);
  if (input.view && input.view.sources.some((source) => !input.sourceIds.includes(source.id)))
    fail2();
  object2(input.context, ["revision", "asOf", "reason", "initialTaskId"]);
  text(input.context.revision, 128);
  instant(input.context.asOf);
  text(input.context.reason);
  if (input.context.initialTaskId !== void 0)
    id2(input.context.initialTaskId);
  if (input.freshness !== null) {
    const report = input.freshness;
    if (!Array.isArray(report.sources) || canonical(report.sources.map((s) => s.id).sort()) !== canonical([...input.sourceIds].sort()))
      fail2();
    const normalized = validateFreshnessReport(report, {
      sources: report.sources.map((s) => ({ id: s.id, version: s.version, url: s.url })),
      windowHours: report.windowHours,
      now: report.evaluatedAt,
      maxCheckAgeMs: report.maxCheckAgeMs
    });
    if (canonical(normalized) !== canonical(report))
      fail2();
  }
  return immutable(input);
}

// src/engine-client/index.ts
var RemoteLessonError = class extends Error {
  constructor(code, outcomeUnknown = false, status, requestId) {
    super(outcomeUnknown ? "The connection ended before this action was confirmed. Retry the same action to reconcile it." : "The Engine request could not complete (" + code + ").");
    this.code = code;
    this.outcomeUnknown = outcomeUnknown;
    this.status = status;
    this.requestId = requestId;
    this.name = "RemoteLessonError";
  }
  code;
  outcomeUnknown;
  status;
  requestId;
};
var MAX_BYTES = 8 * 1024 * 1024;
var MAX_LINE = 2 * 1024 * 1024;
var wireVersion = "lesson-engine-v1";
function defaultId() {
  if (!globalThis.crypto?.randomUUID)
    throw new RemoteLessonError("id-provider-required");
  return globalThis.crypto.randomUUID();
}
function endpointFor(value) {
  const location = globalThis.location;
  if (location?.protocol === "file:")
    throw new RemoteLessonError("served-origin-required");
  const url = new URL(value, location?.href);
  if (url.username || url.password || url.search || url.hash || url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)))
    throw new RemoteLessonError("invalid-endpoint");
  if (location && url.origin !== location.origin)
    throw new RemoteLessonError("same-origin-required");
  return url.href;
}
function remoteFailure(value, status, requestId) {
  const code = value && typeof value === "object" && "error" in value ? value.error : "request-failed";
  const allowed = ["invalid_request", "forbidden", "not_found", "conflict", "cancelled", "timeout", "source_required", "capacity", "host_failure", "unauthenticated", "origin-denied", "request-too-large", "json-required"];
  const safeCode = typeof code === "string" && allowed.includes(code) ? code : "request-failed";
  const uncertain = ["forbidden", "timeout", "host_failure", "cancelled", "capacity", "request-failed"].includes(safeCode);
  return new RemoteLessonError(safeCode, uncertain, status, requestId);
}
async function createRemoteLessonSession(raw) {
  if (!raw || typeof raw.headers !== "function" || Object.keys(raw).some((key) => !["endpoint", "pack", "entryId", "sourceIds", "goal", "minutes", "windowHours", "requestId", "resume", "headers", "fetch", "newId", "timeoutMs", "signal", "onEvent"].includes(key)))
    throw new RemoteLessonError("invalid-options");
  const input = {
    ...raw,
    pack: immutable(raw.pack),
    ...raw.sourceIds ? { sourceIds: immutable(raw.sourceIds) } : {},
    ...raw.resume ? { resume: immutable(raw.resume) } : {}
  };
  const endpoint = endpointFor(input.endpoint);
  const timeoutMs = input.timeoutMs ?? 15e3;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 20 || timeoutMs > 6e4)
    throw new RemoteLessonError("invalid-timeout");
  const selected = input.sourceIds ? [...input.sourceIds].sort() : void 0;
  const pack = immutable(input.pack);
  const newId = input.newId ?? defaultId;
  const fetcher = input.fetch ?? globalThis.fetch;
  let state;
  let initialView = true;
  let disposed = false;
  let cancelling = false;
  let pending = null;
  let inFlight = false;
  const controllers = /* @__PURE__ */ new Set();
  const emit = (event) => {
    try {
      input.onEvent?.(immutable(event));
    } catch {
    }
  };
  const accept = (value, requestId) => {
    const reply = validateEngineReply(value, {
      requestId,
      pack: state?.pack ?? pack,
      entryId: input.entryId,
      ...selected ? { sourceIds: selected } : state ? { sourceIds: state.sourceIds } : {},
      ...state ? { sessionId: state.sessionId, scopeKey: state.scopeKey } : input.resume ? input.resume : {}
    });
    if (!state || reply.sequence >= state.sequence)
      state = reply;
    return reply;
  };
  function getView() {
    if (!state?.view)
      throw new RemoteLessonError("view-unavailable");
    return state.view;
  }
  async function request(command2, stream = false, onReady) {
    if (disposed || input.signal?.aborted)
      throw new RemoteLessonError("cancelled", false, void 0, command2.requestId);
    const controller = new AbortController();
    controllers.add(controller);
    let sent = false, timer;
    const abort = () => controller.abort();
    input.signal?.addEventListener("abort", abort, { once: true });
    let rejectAbort = () => {
    };
    const interrupted = new Promise((_, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () => rejectAbort(new RemoteLessonError("cancelled", sent, void 0, command2.requestId));
    controller.signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      rejectAbort(new RemoteLessonError("timeout", sent, void 0, command2.requestId));
      controller.abort();
    }, timeoutMs);
    const work = async () => {
      const headers = new Headers(await input.headers());
      controller.signal.throwIfAborted();
      headers.set("content-type", "application/json");
      headers.set("accept", stream ? "application/x-ndjson" : "application/json");
      if (!/^Bearer [^\s]+$/.test(headers.get("authorization") ?? ""))
        throw new RemoteLessonError("authentication-required");
      sent = true;
      const init = {
        method: "POST",
        headers,
        body: JSON.stringify(command2),
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal
      };
      const response = await fetcher(endpoint, init);
      controller.signal.throwIfAborted();
      const reader = response.body?.getReader();
      if (!reader)
        throw new RemoteLessonError("empty-response", true, response.status, command2.requestId);
      const cancelReader = () => {
        void reader.cancel().catch(() => {
        });
      };
      controller.signal.addEventListener("abort", cancelReader, { once: true });
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let bytes = 0, buffer = "", last, sequence = 0, finished = false;
      const isStream = response.ok && stream && response.headers.get("content-type")?.startsWith("application/x-ndjson");
      try {
        const line = (raw2) => {
          if (!raw2.trim() || raw2.length > MAX_LINE)
            throw new RemoteLessonError("invalid-stream", true);
          const event = JSON.parse(raw2);
          if (!event || event.protocolVersion !== "lesson-engine-stream-v1" || event.requestId !== command2.requestId || event.sequence !== ++sequence || Object.keys(event).some((key) => !["protocolVersion", "requestId", "sequence", "type", "reply", "error"].includes(key)))
            throw new RemoteLessonError("invalid-stream", true);
          if (event.type === "lesson.ready") {
            if (last || finished)
              throw new RemoteLessonError("invalid-stream", true);
            last = accept(event.reply, command2.requestId);
            onReady?.(last);
            emit({ type: "ready", reply: state });
          } else if (event.type === "freshness.ready") {
            if (!last || finished)
              throw new RemoteLessonError("invalid-stream", true);
            last = accept(event.reply, event.reply?.requestId);
            emit({ type: "freshness", reply: state });
          } else if (event.type === "run.completed") {
            if (!last || finished)
              throw new RemoteLessonError("invalid-stream", true);
            finished = true;
          } else if (event.type === "run.error") {
            throw remoteFailure({ error: event.error }, 503, command2.requestId);
          } else
            throw new RemoteLessonError("invalid-stream", true);
        };
        while (true) {
          controller.signal.throwIfAborted();
          const item = await reader.read();
          controller.signal.throwIfAborted();
          if (item.done)
            break;
          bytes += item.value.byteLength;
          if (bytes > MAX_BYTES)
            throw new RemoteLessonError("response-too-large", true);
          buffer += decoder.decode(item.value, { stream: true });
          if (isStream) {
            let split;
            while ((split = buffer.indexOf("\n")) >= 0) {
              const raw2 = buffer.slice(0, split);
              buffer = buffer.slice(split + 1);
              line(raw2);
            }
          }
          if (buffer.length > MAX_LINE)
            throw new RemoteLessonError("response-too-large", true);
        }
        buffer += decoder.decode();
        if (isStream) {
          if (buffer.trim() || !finished || !last)
            throw new RemoteLessonError("incomplete-stream", true);
          return state;
        }
        const value = JSON.parse(buffer);
        if (!response.ok)
          throw remoteFailure(value, response.status, command2.requestId);
        if (!response.headers.get("content-type")?.startsWith("application/json"))
          throw new RemoteLessonError("invalid-media-type", true);
        last = accept(value, command2.requestId);
        onReady?.(last);
        return last;
      } finally {
        controller.signal.removeEventListener("abort", cancelReader);
        cancelReader();
        reader.releaseLock();
      }
    };
    try {
      return await Promise.race([work(), interrupted]);
    } catch (error) {
      if (error instanceof RemoteLessonError)
        throw error;
      throw new RemoteLessonError("connection-failed", sent, void 0, command2.requestId);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", onAbort);
      input.signal?.removeEventListener("abort", abort);
      controllers.delete(controller);
      controller.abort();
    }
  }
  const startId = input.requestId ?? newId();
  const start = input.resume ? { protocolVersion: wireVersion, requestId: startId, operation: "resume", sessionId: input.resume.sessionId } : {
    protocolVersion: wireVersion,
    requestId: startId,
    operation: "start",
    packId: pack.id,
    packVersion: pack.version,
    entryId: input.entryId,
    ...selected ? { sourceIds: selected } : {},
    ...input.goal !== void 0 ? { goal: input.goal } : {},
    ...input.minutes !== void 0 ? { minutes: input.minutes } : {},
    ...input.windowHours !== void 0 ? { windowHours: input.windowHours } : {}
  };
  let ready = false;
  await new Promise((resolve, reject) => {
    void request(start, start.operation === "start", () => {
      if (!ready) {
        ready = true;
        resolve();
      }
    }).then(() => {
      if (!ready)
        reject(new RemoteLessonError("missing-ready", true));
    }).catch((error) => {
      if (!ready)
        reject(error);
      else
        emit({ type: "error", message: "The lesson is available, but the source update could not finish.", code: error instanceof RemoteLessonError ? error.code : "connection-failed" });
    });
  });
  const mutation = async (command2, cancellingCommand = false) => {
    if (disposed || !cancellingCommand && cancelling)
      throw new RemoteLessonError("cancelled");
    if (state.status === "cancelled" && command2.operation !== "cancel")
      throw new RemoteLessonError("cancelled");
    if (inFlight && !cancellingCommand)
      throw new RemoteLessonError("action-in-flight");
    if (pending && canonical(pending) !== canonical(command2) && !cancellingCommand)
      throw new RemoteLessonError("pending-action", true);
    pending = immutable(command2);
    inFlight = true;
    try {
      const reply = await request(command2);
      if (pending?.requestId === command2.requestId)
        pending = null;
      return reply;
    } catch (error) {
      if (error instanceof RemoteLessonError && !error.outcomeUnknown && pending?.requestId === command2.requestId)
        pending = null;
      throw error;
    } finally {
      inFlight = false;
    }
  };
  const command = (operation, requestId = newId()) => ({ protocolVersion: wireVersion, operation, requestId, sessionId: state.sessionId, expectedRevision: state.revision });
  const read = (operation) => request({ protocolVersion: wireVersion, operation, requestId: newId(), sessionId: state.sessionId });
  return Object.freeze({
    get sessionId() {
      return state.sessionId;
    },
    entryId: input.entryId,
    supportedFormat: "text/choice",
    async next() {
      if (state.status === "cancelled")
        throw new RemoteLessonError("cancelled");
      if (initialView) {
        initialView = false;
        return getView();
      }
      await mutation(pending?.operation === "next" ? pending : command("next"));
      return getView();
    },
    async answer(answer) {
      initialView = false;
      await mutation({
        protocolVersion: wireVersion,
        operation: "answer",
        requestId: answer.responseId,
        sessionId: state.sessionId,
        expectedRevision: pending?.requestId === answer.responseId && "expectedRevision" in pending ? pending.expectedRevision : state.revision,
        answer: { turnId: answer.turnId, choiceId: answer.choiceId }
      });
      return getView();
    },
    async help(help) {
      initialView = false;
      await mutation({
        protocolVersion: wireVersion,
        operation: "help",
        requestId: help.requestId,
        sessionId: state.sessionId,
        expectedRevision: pending?.requestId === help.requestId && "expectedRevision" in pending ? pending.expectedRevision : state.revision,
        help: { turnId: help.turnId }
      });
      return getView();
    },
    async progress() {
      await read("progress");
      return state.progress;
    },
    async resume() {
      initialView = false;
      await read("resume");
      return getView();
    },
    async refresh(options = {}) {
      const refresh = { ...command("refresh"), ...options };
      const result = await mutation(refresh);
      emit({ type: "freshness", reply: state });
      return result;
    },
    async cancel() {
      if (state.status === "cancelled")
        return state;
      const previous = pending;
      cancelling = true;
      controllers.forEach((controller) => controller.abort());
      try {
        const resumed = await read("resume");
        const result = resumed.status === "cancelled" ? state : await mutation(command("cancel"), true);
        pending = null;
        initialView = false;
        emit({ type: "status", reply: state, message: "Session cancelled." });
        return result;
      } catch (error) {
        if (!pending)
          pending = previous;
        throw error;
      } finally {
        cancelling = false;
      }
    },
    async retry() {
      if (!pending)
        throw new RemoteLessonError("no-pending-action");
      await mutation(pending);
      return getView();
    },
    hasPending: () => pending !== null,
    getState: () => state,
    dispose() {
      disposed = true;
      controllers.forEach((controller) => controller.abort());
    }
  });
}
export {
  RemoteLessonError,
  createRemoteLessonSession,
  validateEngineReply
};
