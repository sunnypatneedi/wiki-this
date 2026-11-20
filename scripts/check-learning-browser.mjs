import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = await mkdtemp(path.join(tmpdir(), 'wiki-learning-'));
let browser;
try {
  execFileSync('sh', [path.join(root, 'scripts/build-sample.sh'), fixture], { stdio: 'inherit' });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const network = [];
  const errors = [];
  await context.route(/^https?:/, route => { network.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const lessonURL = pathToFileURL(path.join(fixture, 'examples/http-caching-lesson.html')).href;
  await page.goto(lessonURL);
  assert.match(await page.locator('.lesson-intro .lbl').innerText(), /Free lesson · about 5 minutes/);
  assert.match(
    await page.locator('.lesson-intro .lesson-free').innerText(),
    /This first lesson is free\. More lessons on this topic will need a paid plan, coming soon\./,
  );
  await page.locator('#lesson-player').waitFor({ state: 'visible' });
  assert.match(await page.locator('#lesson-starting-point').innerText(), /Unknown/);
  assert.equal(await page.locator('#lesson-fallback').isVisible(), false);
  const pack = JSON.parse(await readFile(path.join(root, 'references/sample/learning-pack.json'), 'utf8'));
  await page.getByRole('button', { name: 'Get a hint', exact: true }).click();
  await page.locator('.lesson-hint').waitFor();
  await page.locator(`input[value="${pack.tasks[0].correctChoiceId}"]`).check();
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await page.locator('.lesson-feedback').waitFor();
  assert.match(await page.locator('#lesson-progress').innerText(), /Answers with support\s+1/);
  await page.locator('.lesson-save summary').click();
  const save = async () => {
    const pending = page.waitForEvent('download');
    await page.locator('#lesson-export').click();
    const download = await pending;
    return JSON.parse(await readFile(await download.path(), 'utf8'));
  };
  const importCheckpoint = async checkpoint => {
    await page.locator('#lesson-import').setInputFiles({ name: 'progress.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(checkpoint)) });
    await page.waitForFunction(() => !document.getElementById('lesson-player').hasAttribute('aria-busy'));
  };
  const checkpoint = await save();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('.lesson-feedback').waitFor({ state: 'detached' });
  await importCheckpoint(checkpoint);
  await page.locator('.lesson-feedback').waitFor();
  assert.match(await page.locator('#lesson-checkpoint-status').innerText(), /restored/);
  const invalid = structuredClone(checkpoint);
  invalid.packCanonical += ' changed';
  await importCheckpoint(invalid);
  assert.match(await page.locator('#lesson-checkpoint-status').innerText(), /does not match/);
  assert.equal(await page.locator('.lesson-feedback').count(), 1);
  for (let turn = 0; turn < 8; turn++) {
    if (await page.locator('#lesson-turn-title').innerText() === 'Practice complete') break;
    if (await page.locator('.lesson-feedback').count()) {
      await page.getByRole('button', { name: /^(Continue|See your progress)$/ }).click();
    } else {
      const prompt = await page.locator('#lesson-turn legend').innerText();
      const task = pack.tasks.find(task => task.prompt === prompt);
      assert.ok(task, 'UI question must map to the shared pack.');
      await page.locator(`input[value="${task.correctChoiceId}"]`).check();
      await page.getByRole('button', { name: 'Check answer', exact: true }).click();
    }
  }
  assert.equal(await page.locator('#lesson-turn-title').innerText(), 'Practice complete');
  const complete = await save();
  await importCheckpoint(complete);
  assert.equal(await page.locator('#lesson-turn-title').innerText(), 'Practice complete');
  await page.locator('#lesson-plain-toggle').click();
  assert.equal(await page.locator('#lesson-fallback').isVisible(), true);
  await importCheckpoint(checkpoint);
  assert.equal(await page.locator('#lesson-fallback').isVisible(), false);

  await page.goto(lessonURL + '?src=rfc');
  await page.locator('#lesson-player').waitFor({ state: 'visible' });
  assert.match(await page.locator('#lesson-source-scope').innerText(), /RFC 9111/);
  const citations = await page.locator('#lesson-turn .more a').allTextContents();
  assert.equal(citations.length, 1);
  assert.match(citations[0], /RFC 9111/);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Lesson must fit a 320px viewport.');
  const accessibility = await new AxeBuilder({ page }).include('#lesson-player').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(accessibility.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), []);
  await page.goto(lessonURL + '?src=unrecognized');
  assert.equal(await page.locator('#lesson-player').isVisible(), false);
  assert.equal(await page.locator('#lesson-fallback').isVisible(), true);
  assert.match(await page.locator('#lesson-availability').innerText(), /unavailable/);

  const hostile = await context.newPage();
  await hostile.addInitScript(() => {
    let pack;
    Object.defineProperty(window, 'LEARNER_PACK', {
      configurable: true, get: () => pack,
      set: value => { value.tasks[0].prompt = '<img src="https://invalid.example/lesson" onerror="window.lessonInjected=true">'; pack = value; }
    });
  });
  await hostile.goto(lessonURL);
  await hostile.locator('#lesson-player').waitFor({ state: 'visible' });
  assert.match(await hostile.locator('#lesson-turn legend').innerText(), /<img src=/);
  assert.equal(await hostile.locator('#lesson-turn img').count(), 0);
  assert.equal(await hostile.evaluate(() => window.lessonInjected === true), false);

  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const plain = await noJS.newPage();
  await plain.goto(lessonURL);
  assert.equal(await plain.locator('#lesson-fallback').isVisible(), true);
  assert.equal(await plain.locator('#lesson-player').isVisible(), false);
  assert.match(await plain.locator('.lesson-intro .lesson-free').innerText(), /This first lesson is free/);
  assert.deepEqual(network, [], 'Local lessons must not issue HTTP requests.');
  assert.deepEqual(errors, []);
  console.log('Browser flow, free-lesson intro, hints, exact resume, rejected imports, source scope, mobile layout, accessibility, safe rendering and no-network mode passed.');
} finally {
  if (browser) await browser.close();
  await rm(fixture, { recursive: true, force: true });
}
