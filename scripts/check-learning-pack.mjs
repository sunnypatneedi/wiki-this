import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { validateLearningPack, createLessonSession } from '../assets/learning/learner-runtime.mjs';

const root = new URL('../', import.meta.url);
const pack = validateLearningPack(JSON.parse(await readFile(new URL('references/sample/learning-pack.json', root), 'utf8')));
const sandbox = { window: {} };
vm.runInNewContext(await readFile(new URL('references/sample/data.js', root), 'utf8'), sandbox);
for (const source of pack.sources) assert.ok(sandbox.window.WIKI.sources.some(item => item.id === source.id), 'Learning source is missing from the wiki.');
for (const entry of pack.entries) assert.ok(Object.hasOwn(sandbox.window.WIKI.articles, entry.id), 'Learning entry is missing from the wiki.');
const pin = JSON.parse(await readFile(new URL('assets/learning/PIN.json', root), 'utf8'));
assert.equal(pin.schemaVersion, 'learner-runtime-pin-v1');
assert.equal(pin.repository, 'https://github.com/sunnypatneedi/LearnerContextKit');
assert.match(pin.revision, /^[a-f0-9]{40}$/);
assert.deepEqual(pin.files.map(file => file.path).sort(), [
  'assets/learning/learner-runtime.js', 'assets/learning/learner-runtime.mjs', 'assets/learning/LICENSE',
  'assets/learning/learner-engine-client.js', 'assets/learning/learner-engine-client.mjs', 'assets/learning/learner-engine.mjs',
  'references/learning-pack.schema.json', 'scripts/lesson-cli.mjs',
].sort());
for (const file of pin.files) {
  const bytes = await readFile(new URL(file.path, root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `Pinned file changed: ${file.path}`);
}
const generated = { window: {} };
vm.runInNewContext(await readFile(new URL('references/sample/learning-pack.js', root), 'utf8'), generated);
assert.deepEqual(JSON.parse(JSON.stringify(generated.window.LEARNER_PACK)), pack, 'Classic-script pack differs from JSON.');
const entryId = 'freshness-lifetime';
const session = createLessonSession({ pack, entryId });
let view = await session.next();
assert.equal(view.kind, 'question');
assert.equal(view.progress.level, null);
assert.equal(view.progress.status, 'unassessed');
view = await session.help({ turnId: view.turnId, requestId: 'wiki-hint' });
const task = pack.tasks.find(task => task.id === view.taskId);
const answer = { turnId: view.turnId, responseId: 'wiki-answer', choiceId: task.correctChoiceId };
view = await session.answer(answer);
await session.answer(answer);
assert.equal(view.progress.attempted, 1);
assert.equal(view.progress.assisted, 1);
assert.equal(view.progress.canClaimDurableCompetence, false);
const checkpoint = await session.checkpoint();
const result = spawnSync(process.execPath, [fileURLToPath(new URL('scripts/lesson-cli.mjs', root))], {
  input: JSON.stringify({ operation: 'resume', pack, checkpoint }), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
});
assert.equal(result.status, 0, result.stderr);
const headless = JSON.parse(result.stdout);
assert.equal(headless.view.kind, 'feedback');
assert.equal(headless.view.taskId, view.taskId);
assert.equal(headless.progress.attempted, 1);
assert.equal(headless.progress.assisted, 1);
const changed = structuredClone(pack);
changed.tasks[0].prompt += ' Changed.';
const fresh = createLessonSession({ pack: changed, entryId });
await assert.rejects(fresh.restore(checkpoint));
const freeNote = /This first lesson is free\. More lessons on this topic will need a paid plan, coming soon\./;
for (const relative of ['examples/http-caching-lesson.html', 'examples/http-caching-connected.html']) {
  const html = await readFile(new URL(relative, root), 'utf8');
  assert.match(html, /class="lbl">Free lesson/);
  assert.match(html, /class="lesson-note lesson-free"/);
  assert.match(html, freeNote);
  assert.match(html, /Want a full course on this\?/);
  assert.doesNotMatch(html, /stripe|billing|spend endpoint|charge/i);
}
console.log('Learning pack, wiki references, pinned artifacts, assistance, retries, headless checkpoint parity, and free-lesson intro passed.');
