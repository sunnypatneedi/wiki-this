/*! LearnerContextKit local lesson runtime. MIT (c) 2026 Sunny Patneedi. See LICENSE. */
"use strict";
var LearnerLesson = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/lesson/index.ts
  var index_exports = {};
  __export(index_exports, {
    LearningContractError: () => LearningContractError,
    createLessonSession: () => createLessonSession,
    validateLearningPack: () => validateLearningPack
  });

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
  function timestamp(value, label) {
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
    const at = timestamp(e.at, "evidence.at");
    if (at > now) throw new ExpertiseError("Future evidence is not admissible");
    if (e.referenceEvidenceId !== void 0) required(e.referenceEvidenceId, "referenceEvidenceId");
    if (e.lastRelevantExposureAt !== void 0 && timestamp(e.lastRelevantExposureAt, "lastRelevantExposureAt") > at) {
      throw new ExpertiseError("Exposure cannot occur after the assessment");
    }
  }
  function evaluateExpertise(scope, evidence, now, policy = DEFAULT_EXPERTISE_POLICY) {
    validateScope(scope);
    validatePolicy(policy);
    const nowMs = timestamp(now, "now");
    const scoped = evidence.filter((e) => matches(e, scope));
    const ids2 = /* @__PURE__ */ new Set();
    const attempts = /* @__PURE__ */ new Set();
    for (const e of scoped) {
      validateEvidence(e, nowMs);
      if (ids2.has(e.id) || attempts.has(e.attemptId)) throw new ExpertiseError("Duplicate evidence/attempt in this scope");
      ids2.add(e.id);
      attempts.add(e.attemptId);
    }
    const sorted = [...scoped].sort((a, b) => timestamp(a.at, "at") - timestamp(b.at, "at") || a.id.localeCompare(b.id));
    const fresh = sorted.filter((e) => nowMs - timestamp(e.at, "at") <= policy.maxEvidenceAgeDays * DAY);
    const byId = new Map(sorted.map((e) => [e.id, e]));
    const excluded = [];
    const accepted = /* @__PURE__ */ new Set();
    const eligible = [];
    for (const e of sorted) {
      const reject = (reason) => {
        excluded.push({ id: e.id, reason });
      };
      if (!verified(e)) {
        reject("unverified_or_model_only");
        continue;
      }
      if (e.assistance !== "none") {
        reject("substantive_assistance_or_unknown");
        continue;
      }
      if (e.score < policy.passScore) {
        reject("below_rubric_threshold");
        continue;
      }
      if (e.kind === "retention" || e.kind === "transfer") {
        const ref = e.referenceEvidenceId ? byId.get(e.referenceEvidenceId) : void 0;
        if (!ref || !accepted.has(ref.id) || timestamp(ref.at, "at") >= timestamp(e.at, "at")) {
          reject("missing_or_unqualified_prior_evidence");
          continue;
        }
        if (sorted.some((x) => timestamp(x.at, "at") < timestamp(e.at, "at") && x.taskFamilyId === e.taskFamilyId)) {
          reject("reused_task_family");
          continue;
        }
        if (e.kind === "retention") {
          if (e.lastRelevantExposureAt === void 0) {
            reject("unknown_exposure_history");
            continue;
          }
          const exposure = timestamp(e.lastRelevantExposureAt, "lastRelevantExposureAt");
          const knownExposure = sorted.filter((x) => timestamp(x.at, "at") < timestamp(e.at, "at")).reduce((latest, x) => Math.max(latest, timestamp(x.at, "at")), timestamp(ref.at, "at"));
          if (exposure < knownExposure || timestamp(e.at, "at") - exposure < policy.retentionDelayDays * DAY) {
            reject("insufficient_delay_or_inconsistent_exposure_history");
            continue;
          }
        } else if (sorted.some((x) => timestamp(x.at, "at") < timestamp(e.at, "at") && x.contextId === e.contextId)) {
          reject("transfer_requires_new_context");
          continue;
        }
      }
      accepted.add(e.id);
      if (nowMs - timestamp(e.at, "at") <= policy.maxEvidenceAgeDays * DAY) eligible.push(e);
      else reject("stale");
    }
    const latestByFamily = /* @__PURE__ */ new Map();
    for (const e of fresh.filter((e2) => verified(e2) && e2.assistance === "none")) {
      const prev = latestByFamily.get(e.taskFamilyId);
      if (!prev || timestamp(e.at, "at") > timestamp(prev.at, "at") || e.score < prev.score) latestByFamily.set(e.taskFamilyId, e);
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
    object(input, ["pack", "entryId", "sourceIds", "goal", "minutes", "sessionId", "clock", "newId"], "lesson options");
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
    const constraints = { sessionId: input.sessionId, goal: input.goal, minutes: input.minutes };
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
    const packCanonical = canonical(pack);
    let meta = { sessionId: input.sessionId ?? newId(), goal: input.goal ?? entry.objective, minutes: input.minutes ?? 5 };
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
        object(saved, ["schemaVersion", "trust", "packId", "packVersion", "packCanonical", "sessionId", "entryId", "sourceIds", "goal", "minutes", "history"], "checkpoint");
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
        if (constraints.sessionId !== void 0 && constraints.sessionId !== saved.sessionId || constraints.goal !== void 0 && constraints.goal !== saved.goal || constraints.minutes !== void 0 && constraints.minutes !== saved.minutes)
          fail("Checkpoint options mismatch");
        array(saved.history, 0, LESSON_LIMITS.history, "checkpoint.history");
        saved.history.forEach(validateEvent);
        if (canonical(saved).length > LESSON_LIMITS.checkpointCharacters)
          fail("Checkpoint is too large");
        const restored = { sessionId: saved.sessionId, goal: saved.goal, minutes: saved.minutes };
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
  return __toCommonJS(index_exports);
})();
