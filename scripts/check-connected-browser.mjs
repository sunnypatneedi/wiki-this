import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const pack = JSON.parse(await readFile(path.join(root, 'references/sample/learning-pack.json'), 'utf8'));
const server = spawn(process.execPath, [path.join(root, 'scripts/serve-connected-learning.mjs'), '--port', '0', '--fixture-sources'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe']
});
let serverErrors = '';
server.stderr.on('data', data => { serverErrors = (serverErrors + data).slice(-8000); });
let browser;
try {
  const ready = await new Promise((resolve, reject) => {
    const lines = createInterface({ input: server.stdout });
    const timeout = setTimeout(() => { lines.close(); reject(new Error('Connected demo did not start. ' + serverErrors)); }, 30000);
    server.once('error', error => { clearTimeout(timeout); lines.close(); reject(error); });
    server.once('exit', code => { clearTimeout(timeout); lines.close(); reject(new Error('Connected demo exited before startup: ' + code + ' ' + serverErrors)); });
    lines.on('line', line => {
      let value;
      try { value = JSON.parse(line); } catch { return; }
      if (value.event !== 'connected-demo-ready') return;
      clearTimeout(timeout);
      lines.close();
      resolve(value);
    });
  });
  assert.equal(ready.sourceMode, 'fixture');
  const connectedURL = new URL(ready.url);
  assert.equal(connectedURL.hostname, '127.0.0.1');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const requests = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  context.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      assert.equal(url.origin, connectedURL.origin, 'The browser must use only the configured same-origin host.');
      if (url.pathname === '/api/lessons' && request.method() === 'POST') requests.push(request.postDataJSON());
    }
  });

  async function connect(profile) {
    const page = await context.newPage();
    let authRequests = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/demo-session') authRequests++; });
    const before = requests.length;
    await page.goto(connectedURL.href);
    assert.equal(await page.locator('#lesson-player').isVisible(), false);
    assert.equal(authRequests, 0, 'Loading the page must not authenticate.');
    assert.equal(requests.length, before, 'Loading the page must not start an Engine session.');
    await page.locator('#lesson-demo-profile').selectOption(profile);
    const authReady = page.waitForResponse(response => new URL(response.url()).pathname === '/api/demo-session');
    const startReady = page.waitForResponse(response => new URL(response.url()).pathname === '/api/lessons' && response.request().postDataJSON().operation === 'start');
    await page.getByRole('button', { name: 'Connect demo', exact: true }).click();
    const auth = await (await authReady).json();
    assert.equal(auth.profile, profile);
    assert.equal(auth.persistence, 'process-memory');
    await page.locator('#lesson-player').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.getElementById('lesson-updates-summary').textContent.includes('sources checked successfully'));
    await page.locator('.lesson-coverage summary').click();
    assert.match(await page.locator('.lesson-coverage').innerText(), /Synthetic source metadata/);
    const startResponse = await startReady;
    const wire = await startResponse.text();
    const first = startResponse.headers()['content-type'].startsWith('application/x-ndjson')
      ? wire.trim().split('\n').map(line => JSON.parse(line)).find(event => event.type === 'lesson.ready').reply
      : JSON.parse(wire);
    assert.equal(await page.locator('#lesson-turn legend').innerText(), first.view.prompt);
    assert.equal(first.context.initialTaskId ?? first.view.taskId, first.view.taskId);
    assert.equal(authRequests, 1);
    assert.equal(await page.locator('.lesson-save').count(), 0, 'Remote sessions must not offer local checkpoint import/export.');
    const stored = await page.evaluate(() => ({
      local: Object.values(localStorage), session: Object.values(sessionStorage)
    }));
    assert.equal(JSON.stringify(stored).includes(auth.token), false, 'Credential must not enter browser storage.');
    assert.equal((await page.content()).includes(auth.token), false, 'Credential must not enter HTML.');
    assert.equal(page.url().includes(auth.token), false, 'Credential must not enter a URL.');
    return { page, first };
  }

  const unknown = await connect('unknown');
  const guided = await connect('guided');
  const check = await connect('check');
  assert.equal(unknown.first.view.phase, 'diagnostic');
  assert.equal(guided.first.view.phase, 'practice');
  assert.equal(check.first.view.phase, 'check');
  assert.equal(new Set([unknown.first.view.taskId, guided.first.view.taskId, check.first.view.taskId]).size, 3,
    'Authorized synthetic context should choose three distinct authored starting activities.');
  await guided.page.close();
  await check.page.close();

  const page = unknown.page;
  const initialTask = pack.tasks.find(task => task.id === unknown.first.view.taskId);
  assert.ok(initialTask);
  await page.locator(`input[value="${initialTask.correctChoiceId}"]`).check();

  // Let the server commit the answer, then lose the response. The client must
  // retain the original command until an explicit retry confirms its receipt.
  let droppedAnswer;
  await page.route('**/api/lessons', async route => {
    const request = route.request();
    const command = request.postDataJSON();
    if (command.operation === 'answer' && !droppedAnswer) {
      droppedAnswer = command;
      const response = await route.fetch();
      assert.equal(response.ok(), true);
      await response.body();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await page.locator('#lesson-retry').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#lesson-turn input:enabled').count(), 0);
  assert.equal(requests.filter(command => command.operation === 'answer').length, 1, 'No automatic answer retry.');
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await page.locator('.lesson-feedback').waitFor();
  assert.equal(await page.locator('#lesson-retry').isVisible(), true, 'Reading the server state does not replay the pending write.');
  assert.equal(requests.filter(command => command.operation === 'answer').length, 1);
  await page.getByRole('button', { name: 'Retry last action', exact: true }).click();
  await page.locator('#lesson-retry').waitFor({ state: 'hidden' });
  const answers = requests.filter(command => command.operation === 'answer');
  assert.equal(answers.length, 2);
  assert.deepEqual(answers[0], answers[1], 'Retry must reuse the exact command and request ID.');
  assert.match(await page.locator('#lesson-progress').innerText(), /Answered\s+1/);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('.lesson-feedback').waitFor({ state: 'detached' });

  const prompt = await page.locator('#lesson-turn legend').innerText();
  const selected = page.locator('#lesson-turn input').first();
  await selected.check();
  const choice = await selected.inputValue();
  await page.locator('#lesson-update-window').selectOption('24');
  await page.getByRole('button', { name: 'Check source freshness', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('lesson-updates-summary').textContent.includes('past 24 hours'));
  assert.equal(await page.locator('#lesson-turn legend').innerText(), prompt);
  assert.equal(await page.locator(`input[value="${choice}"]`).isChecked(), true, 'A source refresh must preserve the selected choice.');
  assert.ok(requests.some(command => command.operation === 'refresh' && command.windowHours === 24));
  assert.match(await page.locator('#lesson-updates-panel').innerText(), /do not automatically change/);

  await page.setViewportSize({ width: 320, height: 900 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Connected lesson must fit a 320px viewport.');
  const accessibility = await new AxeBuilder({ page }).include('.lesson-page').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(accessibility.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), []);

  await page.getByRole('button', { name: 'Cancel run', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('lesson-connection-status').textContent.includes('server confirmed cancellation'));
  assert.equal(await page.locator('#lesson-turn input:enabled').count(), 0);
  assert.equal(await page.locator('.lesson-actions button:enabled').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Reconnect', exact: true }).isEnabled(), true);
  assert.equal(await page.locator('#lesson-retry').isVisible(), false);

  for (const command of requests) {
    for (const forbidden of ['token', 'learnerId', 'tenantId', 'context', 'checkpoint', 'pack']) {
      assert.equal(Object.hasOwn(command, forbidden), false, 'Browser command must not include ' + forbidden);
    }
  }

  const fileContext = await browser.newContext();
  const fileRequests = [];
  await fileContext.route(/^https?:/, route => { fileRequests.push(route.request().url()); return route.abort(); });
  const filePage = await fileContext.newPage();
  await filePage.goto(pathToFileURL(path.join(root, 'examples/http-caching-connected.html')).href);
  assert.equal(await filePage.getByRole('button', { name: 'Connect demo', exact: true }).isDisabled(), true);
  assert.match(await filePage.locator('#lesson-connection-status').innerText(), /No connection was attempted/);
  assert.equal(await filePage.locator('#lesson-player').isVisible(), false);
  assert.equal(await filePage.getByRole('link', { name: 'Use offline lesson', exact: true }).isVisible(), true);
  assert.deepEqual(fileRequests, []);
  assert.deepEqual(errors, []);
  console.log('Connected browser checks passed: explicit auth, context placement, isolated freshness, exact uncertain-action retry, cancellation, privacy, accessibility and file-mode refusal.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
