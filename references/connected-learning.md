# Connected lesson host

This is the optional served-mode integration. The ordinary offline lesson and local
`lesson-cli-v1` protocol retain their existing behavior. A LearningPack remains
content-only; learner identity, authorization and source refresh belong to the host.

## Run the synthetic demonstration

```sh
node scripts/serve-connected-learning.mjs
```

The server listens on loopback, using port 4179 by default. Open the connected URL it
prints, select a synthetic profile and choose **Connect demo**. The browser does not
probe or authenticate before that action. Profiles exercise unknown, guided and check
starting points; none claims to describe the reader's actual competence.

Source modes:

| Flag | Behavior |
| --- | --- |
| No source flag | Check the host's approved public MDN and RFC sources. Failures remain visible. |
| `--fixture-sources` | Use deterministic source metadata for development and browser tests. |
| `--offline-sources` | Explicitly report unavailable network source checks. |

`--port N` selects the loopback port; `--port 0` chooses an available one. On startup,
the server prints one JSON line with `event: "connected-demo-ready"`, the connected
page `url`, and `sourceMode` (`live`, `fixture` or `offline`).

This host uses process memory. Stopping it loses sessions. The page keeps its credential
only in memory, and that credential expires after 30 minutes even if the server remains
running. Closing or refreshing the page does not provide account continuity. The demo
profile endpoint is a demonstration mechanism, not a deployed identity service.

## Host and presenter boundary

The connected page loads the pinned browser client, `connected-demo.js`, then the same
`wiki-adapter.js` presenter used by local lessons.

`connected-demo.js` provides `LEARNER_CONNECTED_HOST.open(options)` and
`subscribe(listener)`. Opening waits for a deliberate Connect click. The adapter sends
only registered pack ID/version, entry, source scope and explicit session constraints
to the Engine. It never sends the pack's source text, page HTML, `WIKI`, a learner
profile, or a local checkpoint.

The demo first posts `{ profile: "unknown" | "guided" | "check" }` to its same-origin
`/api/demo-session`. The response contains an ephemeral token and a process-lifetime
notice. The token stays in a closure and supplies the client's authorization header.
It does not enter markup, URLs, browser storage, shareable packs or downloads.

The public client entry point is:

```js
const session = await LearnerEngineClient.createRemoteLessonSession({
  endpoint: "/api/lessons",
  pack: { id: approvedPack.id, version: approvedPack.version },
  entryId: "freshness-lifetime",
  sourceIds: ["rfc"],
  minutes: 5,
  windowHours: 168,
  requestId: startRequestId,
  headers: getAuthorizedHeaders,
  onEvent(event) {
    // Update status, coverage or update cards here. Do not replace the question
    // in response to background freshness/status events.
  }
});
render(await session.next()); // first call returns the ready view
```

`getAuthorizedHeaders` is supplied by the application host. It is not a function the
pack defines. The client accepts a same-origin served browser endpoint, or an explicitly
configured HTTP loopback/HTTPS endpoint in a headless host. It refuses `file://`,
cross-origin browser endpoints, URL credentials and URL query tokens.

Use a real authenticated identity and permission adapter for a deployed product.
The trusted host resolves learner/tenant context, authorizes the registered pack and
each operation, controls source retrieval, and supplies persistence. A client request
does not establish trusted competence or permission by posting a level or identity.

## Session operations

| Operation | Behavior |
| --- | --- |
| `next()` | Returns the initial ready view on its first call; subsequent calls follow the lesson transition. |
| `answer({ turnId, responseId, choiceId })` | Submits the observed choice, retaining the stable response ID. |
| `help({ turnId, requestId })` | Requests an authored hint and records support. |
| `progress()` | Reads authoritative session progress. |
| `resume()` | Reads and returns the saved view; does not replay an uncertain write. |
| `refresh({ windowHours })` | Requests source metadata for 24, 168 or 720 hours without changing the active task. |
| `hasPending()` | Indicates a write whose receipt has not been confirmed. |
| `retry()` | Retries that same pending command and returns its reconciled view. |
| `cancel()` | Requests server cancellation and returns its acknowledged state. |
| `getState()` | Returns the latest validated Engine reply and metadata. |
| `dispose()` | Stops this client's waits and streams; it does not cancel server work. |

The Engine reply includes session/revision/sequence identifiers, scoped content
references, a lesson view, progress, a minimal context summary, status and freshness.
The context summary omits the host's learner/tenant binding. A scope comparison key is
not a credential and does not grant access.

Remote sessions do not expose the local checkpoint import/export controls. Local
checkpoints remain editable provisional evidence; they are not accepted as trusted
remote session state. The local CLI still uses its own explicit checkpoint protocol.

## Stream without replacing active work

The client emits `ready`, `freshness`, `status` and `error` events, optionally with a
validated `reply`. The presenter renders a ready view and explicitly requested resume
views. Background events update separate connection and source panels only.

Keep the selected choice and keyboard focus when source metadata arrives. An update
must not alter an active question, answer key or source version. A source-byte change
is a signal for later review, not permission to rewrite the lesson automatically.

Freshness coverage separates:

- This attempt's outcome: checked, not modified, error, timeout or offline.
- Last successful check and whether it is within the host's configured age limit.
- Publisher-stated publication/modification dates when available.
- First discovery and observed byte-change dates.
- Whether the bytes match a comparison baseline, differ, or cannot be compared.

The update window is **past 24 hours**, **past 7 days** or **past 30 days**. These are
rolling windows, not calendar periods. Publication, modification, byte-change and
discovery signals receive different labels. Unknown publication dates do not become
claims of recent publication. An empty update list does not prove nothing changed
outside successfully checked coverage.

## Retry and cancellation behavior

A lost response does not establish whether an answer was accepted. When `hasPending()`
is true, the presenter preserves the choice, disables different lesson writes and shows
**Retry last action**. Reconnect reads the saved state but leaves the pending command
available for explicit retry. A successful retry confirms the original receipt rather
than creating a second answer.

Start requests follow the same rule. The demo retains the original start request ID,
token, profile and window across uncertain start retries. It does not silently create
another session with a new ID. A deliberately changed request requires a new ID.

**Cancel run** stays reachable while lesson work is waiting. The UI reports cancellation
only after the server acknowledges `status: "cancelled"`; then new lesson writes stop.
On failure it says cancellation could not be confirmed. Closing the page or calling
`dispose()` only stops this client's wait, and never means the server has cancelled.

## Explicit fallback and headless use

**Use offline lesson** is an ordinary link to the separate local page. It starts local
practice rather than importing remote history or silently synchronizing results. Under
`file://`, the connected example makes no network attempt and keeps that link usable.

Another app or agent host can use the same client contract with its authorized
transport. It should retain a session reference in its permitted private store and
reauthorize on resume. The client's optional `resume: { sessionId, scopeKey }` opens a
known session under that authorization; it is not a bearer token or a substitute for
permission checks. The demo UI reconnects only through its current in-memory session.

There is no connected CLI mode hidden inside `scripts/lesson-cli.mjs`. Hosts that need
HTTP must opt into the separate Engine client, preserve its pending-action semantics,
and present updates separately from learner actions. No model, MCP server or automatic
skill installation is required by this integration.

## Browser verification

`scripts/check-connected-browser.mjs` starts a loopback fixture server and checks the
real browser path: explicit connection, context-dependent starting tasks, isolated
freshness updates, stable action retries after a lost response, cancellation, source
windows, absence of credentials in page/storage, mobile layout, accessibility and
deliberate `file://` refusal. The existing local browser gate remains separate.
