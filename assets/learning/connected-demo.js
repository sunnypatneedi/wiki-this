/* Explicit served-mode demonstration. Tokens stay in this closure; the shareable
   pack supplies content IDs only. Opening a file or loading this script does not
   authenticate, probe a service, fetch a source or start a lesson. */
(function () {
  'use strict';

  const listeners = new Set();
  let options;
  let session;
  let startAttempt;
  let startUncertain = false;
  let activeToken = null;
  let lessonBusy = false;
  let controlOperation = null;
  let lastFreshness = null;
  let resolveOpen;
  const opened = new Promise(resolve => { resolveOpen = resolve; });
  const byId = id => document.getElementById(id);
  const textNode = (tag, text, className) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = String(text);
    return node;
  };
  const served = location.protocol === 'http:' || location.protocol === 'https:';
  const emit = event => listeners.forEach(listener => listener(event));
  const newRequestId = () => globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? 'demo-' + globalThis.crypto.randomUUID()
    : 'demo-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);

  function currentState() {
    return session ? session.getState() : null;
  }

  function currentPending() {
    return Boolean(session && session.hasPending());
  }

  function updateControls() {
    if (!byId('lesson-connect')) return;
    const cancelled = currentState() && currentState().status === 'cancelled';
    byId('lesson-connect').disabled = !served || Boolean(session) || Boolean(controlOperation);
    byId('lesson-demo-profile').disabled = !served || Boolean(session) || Boolean(controlOperation) || startUncertain;
    byId('lesson-update-window').disabled = !served || Boolean(controlOperation) || lessonBusy || currentPending() || cancelled || startUncertain;
    byId('lesson-reconnect').disabled = !session || Boolean(controlOperation) || lessonBusy;
    byId('lesson-refresh').disabled = !session || Boolean(controlOperation) || lessonBusy || currentPending() || cancelled;
    // Cancellation must remain reachable while an answer, refresh or resume waits.
    byId('lesson-cancel').disabled = !session || cancelled || controlOperation === 'cancel';
  }

  function setStatus(message) {
    byId('lesson-connection-status').textContent = message;
  }

  function dateText(value) {
    if (typeof value !== 'string') return 'not recorded';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 19).replace('T', ' ') + ' UTC' : 'not recorded';
  }

  function sourceLabel(id) {
    const sources = globalThis.LEARNER_PACK && globalThis.LEARNER_PACK.sources;
    const source = Array.isArray(sources) ? sources.find(item => item.id === id) : null;
    return source ? source.title : id;
  }

  function sourceAnchor(source) {
    const label = sourceLabel(source.id);
    try {
      const url = new URL(source.url);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        const link = textNode('a', label);
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        return link;
      }
    } catch (_) { /* Missing or unsafe URLs remain plain source names. */ }
    return textNode('span', label);
  }

  function renderFreshness(report) {
    if (!report || !Array.isArray(report.sources) || !Array.isArray(report.updates)) return;
    byId('lesson-updates-panel').hidden = false;
    const output = byId('lesson-updates');
    output.replaceChildren();
    const windows = { 24: '24 hours', 168: '7 days', 720: '30 days' };
    const successful = report.sources.filter(source => source.checkOutcome === 'checked' || source.checkOutcome === 'not_modified').length;
    const coverage = successful + ' of ' + report.sources.length + ' sources checked successfully.';
    byId('lesson-updates-summary').textContent = coverage + ' Update window: past ' + (windows[report.windowHours] || 'requested period') + '. As of ' + dateText(report.asOf) + '.';
    if (successful === 0) {
      output.append(textNode('p', 'Freshness could not be verified in this attempt. Any previous successful check is listed in the coverage details.', 'lesson-note'));
    } else if (successful < report.sources.length) {
      output.append(textNode('p', 'Coverage is incomplete. A failed source check does not establish that the source is unchanged.', 'lesson-note'));
    }

    const updateLabels = {
      published: 'Publisher-dated publication',
      publisher_modified: 'Publisher reports a modification',
      observed_byte_change: 'Source bytes changed; significance has not been reviewed',
      recently_discovered: 'Recently found; publication date is not established'
    };
    if (report.updates.length) {
      const list = document.createElement('ul');
      list.className = 'lesson-update-list';
      report.updates.forEach(update => {
        const item = document.createElement('li');
        item.append(textNode('h3', sourceLabel(update.sourceId)));
        item.append(textNode('p', updateLabels[update.kind] || 'Source update signal'));
        item.append(textNode('p', dateText(update.at)));
        list.append(item);
      });
      output.append(list);
    } else {
      output.append(textNode('p', 'No dated update signals were returned for this window. This does not mean nothing changed outside the checked coverage.', 'lesson-note'));
    }

    const details = document.createElement('details');
    details.className = 'lesson-coverage';
    details.append(textNode('summary', 'Source coverage and dates'));
    const list = document.createElement('ul');
    list.className = 'lesson-coverage-list';
    const outcomes = {
      checked: 'Source fetched successfully',
      not_modified: 'Source revalidated; server reported no modification',
      error: 'Check failed',
      timeout: 'Check timed out',
      offline: 'Source checking is offline'
    };
    const freshness = {
      within_policy: 'Last successful check is within the host’s configured age limit.',
      stale: 'Last successful check is older than the host’s configured age limit.',
      unknown: 'Snapshot freshness is unknown.'
    };
    const relations = {
      unchanged: 'Source bytes match the comparison baseline.',
      changed: 'Source bytes differ from the comparison baseline; meaning has not been reviewed.',
      uncompared: 'No comparable baseline establishes whether the source changed.'
    };
    report.sources.forEach(source => {
      const item = document.createElement('li');
      const heading = document.createElement('h3');
      heading.append(sourceAnchor(source));
      item.append(heading);
      item.append(textNode('p', (outcomes[source.checkOutcome] || 'Check status unavailable') + '. ' + (freshness[source.snapshotFreshness] || '')));
      if (source.detail) item.append(textNode('p', source.detail));
      item.append(textNode('p', 'Last successful check: ' + dateText(source.lastSuccessfulCheckAt) + '. This attempt: ' + dateText(source.checkedAt) + '.'));
      item.append(textNode('p', relations[source.contentRelation] || 'Content comparison is unavailable.'));
      if (source.publisherPublishedAt) item.append(textNode('p', 'Publisher publication date: ' + dateText(source.publisherPublishedAt) + '.'));
      if (source.publisherModifiedAt) item.append(textNode('p', 'Publisher modification date: ' + dateText(source.publisherModifiedAt) + '.'));
      list.append(item);
    });
    details.append(list);
    output.append(details);
  }

  function showMetadata(reply) {
    if (!reply) return;
    if (reply.context) {
      const reason = String(reply.context.reason || 'A starting activity was selected from the authorized synthetic context.').replace(/_/g, ' ');
      byId('lesson-connected-context').textContent = reason + ' Context recorded ' + dateText(reply.context.asOf) + '.';
    }
    if (reply.freshness) {
      const fingerprint = JSON.stringify(reply.freshness);
      if (fingerprint !== lastFreshness) {
        renderFreshness(reply.freshness);
        lastFreshness = fingerprint;
      }
    }
    if (reply.status === 'cancelled') setStatus('The server confirmed cancellation. This session accepts no further lesson actions.');
    updateControls();
  }

  function onEvent(event) {
    if (event.reply) showMetadata(event.reply);
    if (event.type === 'error' && (!currentState() || currentState().status !== 'cancelled')) {
      setStatus('A connection or source update could not finish. Your current question has not been replaced. Reconnect to check the saved state.');
    }
    emit(event);
  }

  // The presenter calls open once. Waiting for the learner's explicit click does
  // not create an authentication request or contact the Engine.
  globalThis.LEARNER_CONNECTED_HOST = {
    open(lessonOptions) {
      if (!served) return Promise.reject(new Error('A served origin is required.'));
      options = {
        pack: { id: lessonOptions.pack.id, version: lessonOptions.pack.version },
        entryId: lessonOptions.entryId,
        ...(lessonOptions.sourceIds ? { sourceIds: lessonOptions.sourceIds.slice() } : {}),
        ...(lessonOptions.goal ? { goal: lessonOptions.goal } : {}),
        ...(lessonOptions.minutes ? { minutes: lessonOptions.minutes } : {})
      };
      return opened;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setLessonBusy(value) {
      lessonBusy = Boolean(value);
      if (!lessonBusy && session) showMetadata(session.getState());
      updateControls();
    }
  };

  function start() {
    const form = byId('lesson-connect-form');
    if (!form) return;
    if (!served) {
      setStatus('This connected demo needs the local demo server. No connection was attempted. The ordinary offline lesson works directly from this file.');
      updateControls();
      return;
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (session || controlOperation) return;
      if (!options || !globalThis.LearnerEngineClient || typeof globalThis.LearnerEngineClient.createRemoteLessonSession !== 'function') {
        setStatus('The connected host is not available. Use the ordinary offline lesson, or serve the complete demo bundle.');
        return;
      }
      const profile = byId('lesson-demo-profile').value;
      const windowHours = Number(byId('lesson-update-window').value);
      if (!['unknown', 'guided', 'check'].includes(profile) || ![24, 168, 720].includes(windowHours)) return;
      if (!startAttempt) startAttempt = { profile, windowHours, requestId: newRequestId(), token: null };
      controlOperation = 'connect';
      updateControls();
      setStatus(startUncertain ? 'Retrying the same start request.' : 'Connecting the selected synthetic context.');
      try {
        if (!startAttempt.token) {
          const response = await fetch('/api/demo-session', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: startAttempt.profile })
          });
          if (!response.ok) throw new Error('Demo session unavailable.');
          const auth = await response.json();
          if (typeof auth.token !== 'string' || !auth.token || auth.profile !== startAttempt.profile || auth.persistence !== 'process-memory') {
            throw new Error('Invalid demo session response.');
          }
          startAttempt.token = auth.token;
          byId('lesson-persistence').textContent = typeof auth.notice === 'string' ? auth.notice : 'Synthetic context. Sessions last only while this demo server is running.';
        }
        activeToken = startAttempt.token;
        const created = await globalThis.LearnerEngineClient.createRemoteLessonSession({
          endpoint: '/api/lessons',
          ...options,
          windowHours: startAttempt.windowHours,
          requestId: startAttempt.requestId,
          headers: async () => ({ Authorization: 'Bearer ' + activeToken }),
          onEvent
        });
        session = created;
        startAttempt = null;
        startUncertain = false;
        byId('lesson-connect').textContent = 'Demo connected';
        byId('lesson-connection-controls').hidden = false;
        byId('lesson-updates-panel').hidden = false;
        showMetadata(session.getState());
        setStatus('Connected to the synthetic demo. Source checks can finish while you work; the current question stays pinned.');
        resolveOpen(session);
      } catch (error) {
        startUncertain = Boolean(error && error.outcomeUnknown);
        if (startUncertain) {
          setStatus('The start outcome is not confirmed. Retry connection to reuse the same request; the profile and window stay fixed until it is resolved.');
          byId('lesson-connect').textContent = 'Retry connection';
        } else {
          startAttempt = null;
          activeToken = null;
          setStatus('The demo could not connect. No connected lesson is available yet. Retry, or use the ordinary offline lesson.');
          byId('lesson-connect').textContent = 'Connect demo';
        }
      } finally {
        controlOperation = null;
        updateControls();
      }
    });

    byId('lesson-reconnect').addEventListener('click', async () => {
      if (!session || controlOperation || lessonBusy) return;
      controlOperation = 'resume';
      updateControls();
      setStatus('Checking the saved session. This does not replay a pending answer.');
      try {
        const view = await session.resume();
        const reply = session.getState();
        showMetadata(reply);
        emit({ type: 'resume', view, reply });
        if (reply.status !== 'cancelled') setStatus(session.hasPending()
          ? 'Saved state loaded. Retry the pending action to confirm its receipt.'
          : 'Saved state loaded. You can continue this session.');
      } catch (error) {
        if (currentState().status !== 'cancelled') setStatus('The saved state could not be confirmed. Keep this tab open and retry; do not assume an unanswered request failed.');
      } finally {
        if (controlOperation === 'resume') controlOperation = null;
        updateControls();
      }
    });

    byId('lesson-refresh').addEventListener('click', async () => {
      if (!session || controlOperation || lessonBusy || session.hasPending() || currentState().status === 'cancelled') return;
      controlOperation = 'refresh';
      updateControls();
      byId('lesson-updates-panel').hidden = false;
      byId('lesson-updates-summary').textContent = 'Checking source freshness. The current question stays unchanged.';
      try {
        await session.refresh({ windowHours: Number(byId('lesson-update-window').value) });
        showMetadata(session.getState());
        // A successful revalidation can return identical metadata. Replace the
        // waiting label even when the report fingerprint has not changed.
        if (session.getState().freshness) renderFreshness(session.getState().freshness);
      } catch (error) {
        if (currentState().status !== 'cancelled') byId('lesson-updates-summary').textContent = 'The freshness request could not be confirmed. Any earlier coverage below remains dated; it is not a successful new check.';
      } finally {
        if (controlOperation === 'refresh') controlOperation = null;
        emit({ type: 'status', reply: session.getState() });
        updateControls();
      }
    });

    byId('lesson-cancel').addEventListener('click', async () => {
      if (!session || controlOperation === 'cancel' || currentState().status === 'cancelled') return;
      controlOperation = 'cancel';
      updateControls();
      setStatus('Requesting cancellation. Stopping the connection alone would not cancel the server session.');
      try {
        const reply = await session.cancel();
        showMetadata(reply);
        if (reply.status === 'cancelled') {
          emit({ type: 'status', reply });
          setStatus('The server confirmed cancellation. Further lesson actions and source releases are stopped.');
        } else {
          setStatus('Cancellation has not been confirmed. Reconnect to check the server state.');
        }
      } catch (error) {
        if (currentState().status !== 'cancelled') setStatus('Cancellation could not be confirmed. The server may still be working. Reconnect, or retry cancellation.');
      } finally {
        controlOperation = null;
        updateControls();
      }
    });

    addEventListener('pagehide', event => { if (session && !event.persisted) session.dispose(); });
    updateControls();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
