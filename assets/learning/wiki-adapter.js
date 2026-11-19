/* A presenter, not a second lesson engine. Authored content is rendered as text.
   Ordinary file pages use the local runtime. A served demo may explicitly supply
   an authorized host; transport and credentials never belong to this presenter. */
(function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };
  let idSequence = 0;
  const requestId = prefix => {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return prefix + '-' + globalThis.crypto.randomUUID();
    }
    idSequence += 1;
    return prefix + '-' + Date.now().toString(36) + '-' + idSequence;
  };

  function sourceLink(source) {
    if (source.url) {
      try {
        const url = new URL(source.url);
        if (url.protocol === 'https:' || url.protocol === 'http:') {
          const link = element('a', '', source.title);
          link.href = url.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          return link;
        }
      } catch (_) { /* An invalid URL remains a plain source name. */ }
    }
    return element('span', '', source.title);
  }

  function checkedDate(value) {
    if (typeof value !== 'string') return 'Source check date not recorded';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Source check date not recorded';
    return 'Source checked ' + date.toISOString().slice(0, 10) + ' (UTC)';
  }

  function start() {
    const player = byId('lesson-player');
    if (!player) return;
    const fallback = byId('lesson-fallback');
    const availability = byId('lesson-availability');
    const turnHost = byId('lesson-turn');
    const progressHost = byId('lesson-progress');
    const status = byId('lesson-status');
    const checkpointStatus = byId('lesson-checkpoint-status');
    const exportButton = byId('lesson-export');
    const importInput = byId('lesson-import');
    const plainToggle = byId('lesson-plain-toggle');
    const pack = globalThis.LEARNER_PACK;
    const runtime = globalThis.LearnerLesson;
    const connected = player.dataset.runtime === 'connected';
    // A shared or downloaded file never consumes connected host configuration.
    const connectedHost = connected && (location.protocol === 'http:' || location.protocol === 'https:')
      ? globalThis.LEARNER_CONNECTED_HOST : null;
    const retryButton = byId('lesson-retry');

    function unavailable(message) {
      availability.textContent = message;
      availability.hidden = false;
      fallback.hidden = false;
      player.hidden = true;
    }

    if (connected && (!connectedHost || typeof connectedHost.open !== 'function')) {
      unavailable('Connected practice needs the deliberately served demo. You can open the ordinary offline lesson instead.');
      return;
    }
    if (!pack || (!connected && (!runtime || typeof runtime.createLessonSession !== 'function'))) {
      unavailable('Interactive practice is unavailable. You can read the plain lesson below.');
      return;
    }
    if (connected) {
      const savePanel = player.querySelector('.lesson-save');
      if (savePanel) savePanel.hidden = true;
    }

    const sourceId = new URLSearchParams(location.search).get('src') || '';
    const wikiSources = globalThis.WIKI && Array.isArray(globalThis.WIKI.sources)
      ? globalThis.WIKI.sources : [];
    if (sourceId && !wikiSources.some(source => source.id === sourceId)) {
      unavailable('That source filter is unavailable. The plain reading version below includes all its listed sources. Return to the article to choose a source.');
      return;
    }
    const options = {
      pack,
      entryId: player.dataset.entryId,
      ...(sourceId ? { sourceIds: [sourceId] } : {}),
      minutes: 5
    };
    let session;
    let currentView;
    let selectedChoiceId = null;
    let pendingAnswer = null;
    let pendingHelp = null;
    let busy = false;

    // The selected source narrows practice; it never changes the shared wiki data.
    const sourceName = sourceId ? wikiSources.find(source => source.id === sourceId).name : null;
    byId('lesson-source-scope').textContent = sourceName
      ? 'Source filter: ' + sourceName + '.' : 'Using all sources in this learning pack.';
    byId('lesson-freshness').textContent = connected
      ? 'The activity stays pinned to its source snapshot. Freshness results appear separately below.'
      : 'Offline snapshot. Check dates are listed with each source; this page does not look for live updates.';

    function syncConnectedControls() {
      if (!connected || !session) return;
      const pending = typeof session.hasPending === 'function' && session.hasPending();
      const cancelled = session.getState().status === 'cancelled';
      if (retryButton) {
        retryButton.hidden = !pending;
        retryButton.disabled = busy;
      }
      if (pending || cancelled) {
        player.querySelectorAll('.lesson-actions button, input[name="lesson-choice"]').forEach(control => {
          control.disabled = true;
        });
      }
      if (cancelled) status.textContent = 'The server confirmed cancellation. Further lesson actions are stopped.';
      if (typeof connectedHost.setLessonBusy === 'function') connectedHost.setLessonBusy(busy);
    }

    function showProgress(progress) {
      progressHost.replaceChildren();
      const list = element('dl');
      const counts = [
        ['Answered', progress.attempted],
        ['Correct self-checks', progress.correct],
        ['Answers with support', progress.assisted]
      ];
      counts.forEach(([label, count]) => {
        const group = element('div');
        group.append(element('dt', '', label), element('dd', '', count));
        list.append(group);
      });
      progressHost.append(list);
      byId('lesson-starting-point').textContent = connected
        ? 'This session uses a synthetic starting point. It does not describe your personal learning history.'
        : progress.status === 'unassessed'
        ? 'Unknown. A short first question gives us a place to begin.'
        : 'Your answers give us a starting point for practice. A competency level has not been established.';
      if (progress.complete) {
        progressHost.append(element('p', 'lesson-note', 'This practice session is complete. Retention needs a later, independent check.'));
      }
    }

    function appendSources(sources) {
      if (!sources.length) return;
      const details = element('details', 'more');
      details.append(element('summary', '', 'Sources and check dates'));
      const body = element('div', 'body');
      sources.forEach(source => {
        const paragraph = element('p');
        paragraph.append(sourceLink(source), document.createTextNode(' · ' + checkedDate(source.checkedAt)));
        body.append(paragraph);
      });
      details.append(body);
      turnHost.append(details);
    }

    async function run(operation, focusTarget) {
      if (busy) return;
      busy = true;
      status.textContent = '';
      player.setAttribute('aria-busy', 'true');
      if (connected && typeof connectedHost.setLessonBusy === 'function') connectedHost.setLessonBusy(true);
      const controls = Array.from(player.querySelectorAll('button, input'))
        .map(control => ({ control, disabled: control.disabled }));
      controls.forEach(({ control }) => { control.disabled = true; });
      try {
        const view = await operation();
        if (view) render(view, focusTarget);
      } catch (error) {
        status.textContent = connected
          ? (session && session.getState().status === 'cancelled'
            ? 'The server confirmed cancellation. Further lesson actions are stopped.'
            : session && session.hasPending()
            ? 'The action outcome is not confirmed. Retry the last action before choosing a different answer or continuing.'
            : 'The connected action could not finish. Reconnect to check the saved state, then try again.')
          : 'That action could not finish. Your current lesson is still here. Try again or export your progress.';
      } finally {
        busy = false;
        player.removeAttribute('aria-busy');
        controls.forEach(({ control, disabled }) => {
          if (control.isConnected) control.disabled = disabled;
        });
        syncConnectedControls();
      }
    }

    function render(view, focusTarget) {
      if (!currentView || view.turnId !== currentView.turnId) {
        selectedChoiceId = null;
        pendingAnswer = null;
        pendingHelp = null;
      }
      if (view.feedback) selectedChoiceId = view.feedback.choiceId;
      currentView = view;
      turnHost.replaceChildren();
      const phaseNames = {
        diagnostic: 'Start with what you know',
        practice: 'Work through the idea',
        check: 'Try a new question',
        complete: 'Practice complete',
        unavailable: 'More content needed'
      };
      const activityLabel = view.kind === 'question'
        ? 'Question ' + (view.progress.attempted + 1)
        : view.kind === 'feedback' ? 'Review your answer' : connected ? 'Connected demo practice' : 'Local practice';
      turnHost.append(element('p', 'lbl', activityLabel));
      const heading = element('h2', '', phaseNames[view.phase] || view.title);
      heading.id = 'lesson-turn-title';
      heading.tabIndex = -1;
      turnHost.append(heading);
      if (view.objective) turnHost.append(element('p', '', view.objective));

      if (view.explanation && view.kind === 'question') {
        const explanation = element('section', 'lesson-block');
        explanation.append(element('h3', '', 'An example to use'), element('p', '', view.explanation));
        turnHost.append(explanation);
      }

      let form;
      let submitButton;
      if (view.kind === 'question' || view.kind === 'feedback') {
        form = element('form');
        const fieldset = element('fieldset', 'lesson-options');
        fieldset.append(element('legend', '', view.prompt));
        view.choices.forEach(choice => {
          const label = element('label');
          const input = element('input');
          input.type = 'radio';
          input.name = 'lesson-choice';
          input.value = choice.id;
          input.checked = choice.id === selectedChoiceId;
          input.disabled = view.kind === 'feedback';
          input.addEventListener('change', () => {
            selectedChoiceId = choice.id;
            pendingAnswer = null;
            if (submitButton) submitButton.disabled = false;
          });
          label.append(input, element('span', '', choice.text));
          fieldset.append(label);
        });
        form.append(fieldset);
        turnHost.append(form);
      } else if (view.prompt) {
        turnHost.append(element('p', '', view.prompt));
      }

      view.hints.forEach((hint, index) => {
        const help = element('section', 'lesson-hint');
        const title = element('h3', '', 'Hint ' + (index + 1));
        if (index === view.hints.length - 1) {
          title.id = 'lesson-latest-hint';
          title.tabIndex = -1;
        }
        help.append(title, element('p', '', hint));
        turnHost.append(help);
      });
      if (view.assistance !== 'none' && (view.kind === 'question' || view.kind === 'feedback')) {
        const supportLabel = view.assistance === 'hint' ? 'Hint used' : view.assistance === 'worked_example' ? 'Example shown' : 'Support used';
        turnHost.append(element('p', 'lesson-note', supportLabel + '. This answer is recorded as supported practice.'));
      }

      if (view.feedback) {
        const feedback = element('section', 'lesson-feedback');
        feedback.setAttribute('aria-label', 'Answer feedback');
        feedback.append(
          element('h3', '', view.feedback.correct ? 'That fits the rule' : 'Revisit the rule'),
          element('p', '', view.feedback.text)
        );
        if (view.explanation && view.explanation !== view.feedback.text) {
          feedback.append(element('p', '', view.explanation));
        }
        turnHost.append(feedback);
      }

      const actions = element('div', 'lesson-actions');
      if (view.kind === 'question') {
        submitButton = element('button', 'btn pri', 'Check answer');
        submitButton.type = 'submit';
        submitButton.disabled = !selectedChoiceId;
        actions.append(submitButton);
        if (view.hintsRemaining > 0) {
          const helpButton = element('button', 'btn sec', view.hints.length ? 'Another hint' : 'Get a hint');
          helpButton.type = 'button';
          helpButton.addEventListener('click', () => {
            if (!pendingHelp) pendingHelp = { turnId: view.turnId, requestId: requestId('hint') };
            run(async () => {
              const updated = await session.help(pendingHelp);
              pendingHelp = null;
              return updated;
            }, 'hint');
          });
          actions.append(helpButton);
        }
        form.append(actions);
        form.addEventListener('submit', event => {
          event.preventDefault();
          if (!selectedChoiceId) return;
          if (!pendingAnswer) {
            pendingAnswer = { turnId: view.turnId, choiceId: selectedChoiceId, responseId: requestId('answer') };
          }
          run(async () => {
            const updated = await session.answer(pendingAnswer);
            pendingAnswer = null;
            return updated;
          }, 'heading');
        });
      } else if (view.kind === 'feedback') {
        const next = element('button', 'btn pri', view.progress.complete ? 'See your progress' : 'Continue');
        next.type = 'button';
        next.addEventListener('click', () => run(() => session.next(), 'heading'));
        actions.append(next);
        turnHost.append(actions);
      } else if (view.kind === 'complete') {
        if (view.explanation) turnHost.append(element('p', 'lesson-note', view.explanation));
        turnHost.append(element('p', 'lesson-note', connected
          ? 'Demo progress lasts only while this server process is running. Keep this tab open to reconnect; there is no account sync or checkpoint export.'
          : 'Export your progress below if you want to keep it. This page will not send reminders or sync your answers.'));
      } else if (view.kind === 'needs_content') {
        turnHost.append(element('p', 'lesson-note', 'The selected sources do not cover another suitable task. The plain lesson and the article remain available.'));
      }

      appendSources(view.sources);
      showProgress(view.progress);
      // The plain version contains explanations and answers. Offer it after the
      // active task sequence, so it is not an unrecorded in-player answer reveal.
      plainToggle.hidden = view.kind !== 'complete' && view.kind !== 'needs_content';
      if (plainToggle.hidden) {
        fallback.hidden = true;
        plainToggle.setAttribute('aria-expanded', 'false');
        plainToggle.textContent = 'Read the plain lesson';
      }
      if (view.kind === 'feedback') {
        status.textContent = view.feedback.correct ? 'Answer checked. Read the feedback, then continue.' : 'Answer checked. Read the explanation, then continue.';
      } else if (focusTarget === 'hint') {
        status.textContent = 'Hint shown. Support is recorded for this answer.';
      }
      if (focusTarget) {
        const target = focusTarget === 'hint' ? byId('lesson-latest-hint') : heading;
        if (target) target.focus({ preventScroll: true });
      }
      syncConnectedControls();
    }

    plainToggle.addEventListener('click', () => {
      fallback.hidden = !fallback.hidden;
      plainToggle.setAttribute('aria-expanded', String(!fallback.hidden));
      plainToggle.textContent = fallback.hidden ? 'Read the plain lesson' : 'Hide the plain lesson';
    });

    if (!connected && exportButton) exportButton.addEventListener('click', () => run(async () => {
      const checkpoint = await session.checkpoint();
      const blob = new Blob([JSON.stringify(checkpoint, null, 2) + '\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = element('a');
      link.href = url;
      link.download = 'lesson-progress.json';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      checkpointStatus.textContent = 'Checkpoint exported. It contains local practice history, not verified mastery.';
    }));

    if (!connected && importInput) importInput.addEventListener('change', () => {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      run(async () => {
        checkpointStatus.textContent = '';
        if (file.size > 1024 * 1024) {
          checkpointStatus.textContent = 'That checkpoint is too large. Choose a checkpoint under 1 MB.';
          importInput.value = '';
          return;
        }
        try {
          const checkpoint = JSON.parse(await file.text());
          // The host keeps the current entry/source scope. A valid checkpoint supplies
          // its original session ID, goal and time budget for cross-host replay.
          const candidate = runtime.createLessonSession({
            pack,
            entryId: options.entryId,
            ...(sourceId ? { sourceIds: [sourceId] } : {})
          });
          const restored = (await candidate.restore(checkpoint)) || (await candidate.next());
          session = candidate;
          currentView = null;
          checkpointStatus.textContent = 'Progress restored for this pack and source filter. All imported practice remains provisional.';
          return restored;
        } catch (error) {
          checkpointStatus.textContent = 'This checkpoint does not match this lesson, its content or the current source filter, or it is not a valid checkpoint. Your current progress is unchanged.';
        } finally {
          importInput.value = '';
        }
      }, 'heading');
    });

    if (connected && retryButton) retryButton.addEventListener('click', () => run(async () => {
      const view = await session.retry();
      pendingAnswer = null;
      pendingHelp = null;
      return view;
    }, 'heading'));

    if (connected && typeof connectedHost.subscribe === 'function') {
      connectedHost.subscribe(event => {
        // Background events update metadata only. Replacing a view is reserved for
        // an explicit reconnect, so source checks cannot erase a learner's choice.
        if (event.type === 'resume' && event.view && !busy) {
          render(event.view, 'heading');
          status.textContent = session && session.hasPending()
            ? 'Connection restored. Retry the pending action to confirm its receipt before continuing.'
            : 'Saved lesson state restored.';
        }
        if (event.type === 'status' && event.reply && event.reply.status === 'cancelled') {
          status.textContent = 'The server confirmed cancellation. Further lesson actions are stopped.';
        }
        syncConnectedControls();
      });
    }

    (async () => {
      try {
        session = connected ? await connectedHost.open(options) : runtime.createLessonSession(options);
        const first = await session.next();
        render(first);
        player.hidden = false;
        fallback.hidden = true;
        availability.hidden = true;
      } catch (error) {
        unavailable(connected
          ? 'Connected practice could not start. The ordinary offline lesson remains available from the link above.'
          : 'Interactive practice could not start for this source selection. The plain reading version below remains available.');
      }
    })();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
