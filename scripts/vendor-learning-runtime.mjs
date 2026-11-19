import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--kit' || args[2] !== '--revision' || !/^[a-f0-9]{40}$/.test(args[3])) {
  throw new Error('Usage: node scripts/vendor-learning-runtime.mjs --kit PATH --revision FULL_COMMIT_SHA');
}
const kit = path.resolve(args[1]);
const root = fileURLToPath(new URL('../', import.meta.url));
const upstream = 'https://github.com/sunnypatneedi/LearnerContextKit';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: kit, encoding: 'utf8' }).trim();
if (head !== args[3]) throw new Error('The requested revision must match the Kit checkout HEAD.');
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: kit, encoding: 'utf8' }).trim()) {
  throw new Error('Commit or clean the Kit source changes before pinning a runtime.');
}
// Rebuild from that clean revision; never label stale dist files with a newer SHA.
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'bundle:lesson'], { cwd: kit, stdio: 'inherit' });
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'bundle:engine'], { cwd: kit, stdio: 'inherit' });
const mappings = [
  ['dist/lesson/browser.js', 'assets/learning/learner-runtime.js'],
  ['dist/lesson/standalone.mjs', 'assets/learning/learner-runtime.mjs'],
  ['dist/engine-client/browser.js', 'assets/learning/learner-engine-client.js'],
  ['dist/engine-client/standalone.mjs', 'assets/learning/learner-engine-client.mjs'],
  ['dist/engine/standalone.mjs', 'assets/learning/learner-engine.mjs'],
  ['LICENSE', 'assets/learning/LICENSE'],
  ['schemas/learning-pack.schema.json', 'references/learning-pack.schema.json'],
];
const files = [];
for (const [source, destination] of mappings) {
  const bytes = await readFile(path.join(kit, source));
  const target = path.join(root, destination);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(kit, source), target);
  files.push({ path: destination, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const cliSource = await readFile(path.join(kit, 'bin/learner-lesson.mjs'), 'utf8');
if (!cliSource.includes("'../dist/lesson/index.js'")) throw new Error('Unexpected CLI import; update vendor mapping explicitly.');
const cli = cliSource.replace("'../dist/lesson/index.js'", "'../assets/learning/learner-runtime.mjs'");
await writeFile(path.join(root, 'scripts/lesson-cli.mjs'), cli);
files.push({ path: 'scripts/lesson-cli.mjs', sha256: createHash('sha256').update(cli).digest('hex') });
const manifest = { schemaVersion: 'learner-runtime-pin-v1', repository: upstream, revision: args[3], files };
await writeFile(path.join(root, 'assets/learning/PIN.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(root, 'assets/learning/PIN.md'), `# Shared lesson runtime\n\nGenerated from [LearnerContextKit ${args[3].slice(0, 12)}](${upstream}/commit/${args[3]}). MIT license is included beside the bundles.\n\nThe ordinary lesson runtime stays local and performs no network I/O. Separate optional Engine client and Node host bundles support the served connected example. No model provider or production identity is configured. Source repository access may require authorization; consuming these MIT-licensed vendored builds does not.\n\nFiles and SHA-256 digests are recorded in PIN.json and checked by learning:check. The local IIFE and ESM builds share src/lesson/index.ts. Optional client builds share src/engine-client/index.ts; the Node host uses src/engine-host/index.ts. The local CLI only substitutes its import path.\n\nTo update: check out the intended Kit commit, run npm ci, npm run bundle:lesson and npm run bundle:engine there, then run node scripts/vendor-learning-runtime.mjs --kit PATH --revision FULL_COMMIT_SHA here. Verify the provided revision matches that checkout and review the upstream changes. Run npm run learning:check, npm run learning:browser and npm run learning:connected-browser before committing. Never hand-edit the generated runtime, CLI, schema, or digests.\n`);
console.log(`Vendored ${files.length} files from ${args[3]}.`);
