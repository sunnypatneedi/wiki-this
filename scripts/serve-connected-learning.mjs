#!/usr/bin/env node
/** Explicit synthetic, loopback-only reference host. No production identity or durable account store. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createLessonEngine, createMemoryEngineStore, createEvidenceContextProvider,
  createLessonEngineHandler, createHttpFreshnessProvider, createUnavailableFreshnessReport, validateFreshnessReport,
} from '../assets/learning/learner-engine.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
let port = 4179, sourceMode = 'live';
while (args.length) {
  const arg = args.shift();
  if (arg === '--port') port = Number(args.shift());
  else if (arg === '--fixture-sources' && sourceMode === 'live') sourceMode = 'fixture';
  else if (arg === '--offline-sources' && sourceMode === 'live') sourceMode = 'offline';
  else throw new Error('Usage: node scripts/serve-connected-learning.mjs [--port NUMBER] [--fixture-sources | --offline-sources]');
}
if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
const pack = JSON.parse(await readFile(path.join(root, 'references/sample/learning-pack.json'), 'utf8'));
const tokens = new Map();
const members = new Map();
const membershipKey = binding => JSON.stringify([binding.issuer, binding.tenantId, binding.learnerId, binding.productId]);
const current = () => new Date().toISOString();
const active = binding => {
  const member = members.get(membershipKey(binding));
  return member && member.expiresAt > Date.now() ? member : null;
};
function fixtureEvidence(binding, scope, profile) {
  const { tenantId, ...evidenceScope } = scope;
  const count = profile === 'check' ? 3 : profile === 'guided' ? 1 : 0;
  const observations = Array.from({ length: count }, (_, index) => {
    const id = 'synthetic-prior-' + index;
    const at = new Date(Date.now() - (index + 1) * 86400000).toISOString();
    return { type: 'performance', id, scope, at, evidence: { ...evidenceScope, id, attemptId: id, sessionId: id,
      taskFamilyId: id, contextId: id, at, kind: 'practice', score: 1,
      assistance: profile === 'guided' ? 'hint' : 'none', assessment: 'verified', assessor: 'human', artifactRef: 'synthetic-fixture://' + id } };
  });
  return { binding, revision: 'synthetic-' + profile, asOf: current(), evidence: {
    binding: { tenantId: binding.tenantId, learnerId: binding.learnerId }, revision: observations.length, observations,
  } };
}
const context = createEvidenceContextProvider({ read: ({ binding, scope }) => {
  const member = active(binding); if (!member) return null;
  return fixtureEvidence(binding, scope, member.profile);
} });
const live = createHttpFreshnessProvider({ registry: pack.sources.map(source => ({ id: source.id, version: source.version, url: source.url, public: true })),
  timeoutMs: 4500, maxBytes: 1024 * 1024, sha256: async bytes => createHash('sha256').update(bytes).digest('hex') });
const fixtureSources = request => {
  const now = current(), old = new Date(Date.now() - 60 * 86400000).toISOString(), recent = new Date(Date.now() - 2 * 3600000).toISOString();
  const report = { schemaVersion: 'freshness-report-v1', asOf: now, evaluatedAt: now, windowHours: request.windowHours, maxCheckAgeMs: request.maxCheckAgeMs,
    sources: request.sources.map((source, index) => ({ ...source, checkedAt: now, lastSuccessfulCheckAt: now,
      publisherPublishedAt: old, publisherModifiedAt: index ? old : recent, firstSeenAt: old, contentChangedAt: null,
      checkOutcome: 'checked', snapshotFreshness: 'within_policy', baselineSha256: 'a'.repeat(64), contentSha256: 'a'.repeat(64), contentRelation: 'unchanged',
      detail: 'Synthetic source metadata for deterministic demonstration; no publisher was contacted.' })), updates: [] };
  return validateFreshnessReport(report, { ...request, now });
};
const engine = createLessonEngine({
  store: createMemoryEngineStore({ maxSessions: 100, maxReceipts: 5000, maxCharacters: 32 * 1024 * 1024 }),
  authorize: ({ binding, pack: ref }) => Boolean(active(binding)) && ref.id === pack.id && ref.version === pack.version,
  loadPack: (_binding, ref) => { if (ref.id !== pack.id || ref.version !== pack.version) throw new Error('Unregistered pack'); return pack; },
  context,
  refresh: (request, signal) => sourceMode === 'live' ? live(request, signal) : sourceMode === 'fixture' ? fixtureSources(request) :
    createUnavailableFreshnessReport(request, { now: current(), outcome: 'offline', detail: 'Source networking was explicitly disabled for this demo.' }),
  sourcePolicy: { required: false, maxCheckAgeMs: 86400000, timeoutMs: 5000 }, operationTimeoutMs: 10000,
});
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const security = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY', 'cache-control': 'no-store',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" };
let origin, handler;
function reply(res, status, value) { res.writeHead(status, { ...security, 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
async function bytes(req, limit, signal) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { signal.throwIfAborted(); size += chunk.length; if (size > limit) throw new Error('Body too large'); chunks.push(chunk); }
  signal.throwIfAborted(); return Buffer.concat(chunks);
}
const server = createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 8192 }, async (req, res) => {
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); if (!res.headersSent) reply(res, 408, { error: 'timeout' }); else res.destroy(); }, 18000);
  res.once('close', () => { clearTimeout(timer); if (!res.writableFinished) controller.abort(); });
  try {
    if (!origin || req.headers.host !== new URL(origin).host) { reply(res, 403, { error: 'origin-denied' }); return; }
    const url = new URL(req.url, origin);
    if (url.origin !== origin) { reply(res, 400, { error: 'invalid_request' }); return; }
    if (url.pathname === '/api/demo-session') {
      if (url.search || req.method !== 'POST' || req.headers.origin !== origin || req.headers['content-type']?.split(';')[0] !== 'application/json') { reply(res, 403, { error: 'origin-denied' }); return; }
      const data = JSON.parse((await bytes(req, 1024, controller.signal)).toString('utf8'));
      if (!data || Object.keys(data).length !== 1 || !['unknown', 'guided', 'check'].includes(data.profile)) { reply(res, 400, { error: 'invalid_request' }); return; }
      for (const [token, value] of tokens) if (value.expiresAt <= Date.now()) { tokens.delete(token); members.delete(membershipKey(value.binding)); }
      if (tokens.size >= 100) { reply(res, 503, { error: 'capacity' }); return; }
      const binding = { issuer: 'synthetic-loopback', tenantId: 'synthetic-demo', learnerId: randomUUID(), productId: 'wiki-this-demo' };
      const token = randomBytes(32).toString('base64url'), member = { binding, profile: data.profile, expiresAt: Date.now() + 30 * 60000 };
      tokens.set(token, member); members.set(membershipKey(binding), member);
      const sourceNotice = sourceMode === 'fixture' ? 'Source metadata is synthetic; no publisher is contacted.' : sourceMode === 'offline' ? 'Source networking is disabled.' : 'Live source checks use the approved MDN/RFC URLs; availability is not guaranteed.';
      reply(res, 200, { token, profile: data.profile, persistence: 'process-memory', notice: 'Synthetic learner context. Access expires after 30 minutes; session data lasts only while this demo server is running. ' + sourceNotice }); return;
    }
    if (url.pathname === '/api/lessons') {
      if (url.search) { reply(res, 400, { error: 'invalid_request' }); return; }
      const body = req.method === 'POST' ? await bytes(req, 16384, controller.signal) : undefined;
      const request = new Request(url, { method: req.method, headers: Object.entries(req.headers).flatMap(([name, value]) => value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value]]),
        ...(body ? { body } : {}), signal: controller.signal });
      const response = await handler(request);
      res.writeHead(response.status, { ...security, ...Object.fromEntries(response.headers) }); res.flushHeaders();
      if (response.body) for await (const chunk of response.body) {
        controller.signal.throwIfAborted();
        if (!res.write(chunk)) await new Promise((resolve, reject) => { res.once('drain', resolve); res.once('close', () => reject(new Error('Disconnected'))); });
      }
      res.end(); return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { reply(res, 405, { error: 'invalid_request' }); return; }
    const pathname = decodeURIComponent(url.pathname === '/' ? '/examples/http-caching-connected.html' : url.pathname);
    const relative = pathname.slice(1), extension = path.extname(relative);
    const file = path.resolve(root, relative);
    if (!/^(examples\/[^/]+\.html|assets\/[A-Za-z0-9_./-]+|references\/sample\/[A-Za-z0-9_.-]+)$/.test(relative) ||
      !mime[extension] || !file.startsWith(root) || relative.split('/').includes('..')) { reply(res, 404, { error: 'not_found' }); return; }
    const content = await readFile(file);
    res.writeHead(200, { ...security, 'content-type': mime[extension] }); res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    if (!res.headersSent) reply(res, 400, { error: 'invalid_request' }); else res.destroy();
  } finally { clearTimeout(timer); }
});
server.maxConnections = 32; server.maxHeadersCount = 32; server.keepAliveTimeout = 5000;
server.listen(port, '127.0.0.1', () => {
  origin = 'http://127.0.0.1:' + server.address().port;
  handler = createLessonEngineHandler({ engine, origin, authenticate: request => {
    const token = request.headers.get('authorization')?.replace(/^Bearer /, ''), member = tokens.get(token);
    if (!member || !active(member.binding)) throw new Error('Unauthenticated');
    return member.binding;
  } });
  console.log(JSON.stringify({ event: 'connected-demo-ready', url: origin + '/examples/http-caching-connected.html', sourceMode }));
});
const stop = () => { server.close(); server.closeAllConnections(); tokens.clear(); members.clear(); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
