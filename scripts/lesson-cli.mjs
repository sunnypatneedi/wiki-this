#!/usr/bin/env node
/** One JSON request on stdin; one JSON response on stdout. The host persists checkpoints. */
import { createLessonSession } from '../assets/learning/learner-runtime.mjs';
import { randomUUID } from 'node:crypto';

const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const fields = ['operation', 'pack', 'entryId', 'sourceIds', 'goal', 'minutes', 'checkpoint', 'answer', 'help'];

async function main() {
  if (process.argv.length !== 2) throw new Error('Pass one lesson-cli-v1 JSON request on stdin; no command-line arguments.');
  let input = '';
  let bytes = 0;
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    bytes += Buffer.byteLength(chunk, 'utf8');
    if (bytes > MAX_INPUT_BYTES) throw new Error('Lesson request exceeds 2 MiB.');
    input += chunk;
  }
  const request = JSON.parse(input);
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !fields.includes(key))) {
    throw new Error('Invalid lesson request fields.');
  }
  const { operation, pack, checkpoint } = request;
  if (!['start', 'resume', 'next', 'answer', 'help', 'progress'].includes(operation)) throw new Error('Unknown lesson operation.');
  if (operation === 'start' ? checkpoint !== undefined : !checkpoint) throw new Error('Start creates a session; all other operations require its checkpoint.');
  if (operation !== 'start' && ['entryId', 'sourceIds', 'goal', 'minutes'].some(key => key in request)) {
    throw new Error('A resumed lesson uses its checkpoint context; start a new session to change it.');
  }
  if ((operation === 'answer') !== ('answer' in request) || (operation === 'help') !== ('help' in request)) {
    throw new Error('Answer/help payload must match the requested operation.');
  }
  const context = checkpoint || request;
  const options = { pack, entryId: context.entryId, newId: randomUUID };
  for (const key of ['sourceIds', 'goal', 'minutes']) if (context[key] !== undefined) options[key] = context[key];
  if (checkpoint) options.sessionId = checkpoint.sessionId;
  const session = createLessonSession(options);
  const restored = checkpoint ? await session.restore(checkpoint) : null;
  let view;
  if (operation === 'start' || operation === 'next') view = await session.next();
  else if (operation === 'resume') view = restored ?? await session.next();
  else if (operation === 'answer') view = await session.answer(request.answer);
  else if (operation === 'help') view = await session.help(request.help);
  const result = { protocolVersion: 'lesson-cli-v1', ...(view ? { view } : {}), progress: await session.progress(), checkpoint: await session.checkpoint() };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ protocolVersion: 'lesson-cli-v1', error: error instanceof Error ? error.message : 'Lesson request failed.' })}\n`);
  process.exitCode = 1;
});
