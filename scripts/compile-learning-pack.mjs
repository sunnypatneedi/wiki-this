import { readFile, writeFile } from 'node:fs/promises';
import { validateLearningPack } from '../assets/learning/learner-runtime.mjs';

const check = process.argv[2] === '--check';
if (process.argv.length > 3 || (process.argv[2] && !check)) throw new Error('Usage: node scripts/compile-learning-pack.mjs [--check]');
const pack = JSON.parse(await readFile(new URL('../references/sample/learning-pack.json', import.meta.url), 'utf8'));
validateLearningPack(pack);
// Escaping also makes the data safe if a host later embeds the script in an HTML document.
const json = JSON.stringify(pack, null, 2).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
const output = `// Generated from learning-pack.json; edit the JSON and run npm run learning:compile.\nwindow.LEARNER_PACK = ${json};\n`;
const destination = new URL('../references/sample/learning-pack.js', import.meta.url);
if (check) {
  if (await readFile(destination, 'utf8') !== output) throw new Error('Generated learning-pack.js is stale; run npm run learning:compile.');
} else await writeFile(destination, output);
console.log(`Learning pack ${check ? 'checked' : 'compiled'}: ${pack.id}@${pack.version}.`);
