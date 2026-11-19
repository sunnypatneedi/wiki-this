# Shared lesson runtime

Generated from [LearnerContextKit d5418c08f6e8](https://github.com/sunnypatneedi/LearnerContextKit/commit/d5418c08f6e82da0ace9f5219e8fdb6f81873d74). MIT license is included beside the bundles.

The ordinary lesson runtime stays local and performs no network I/O. Separate optional Engine client and Node host bundles support the served connected example. No model provider or production identity is configured. Source repository access may require authorization; consuming these MIT-licensed vendored builds does not.

Files and SHA-256 digests are recorded in PIN.json and checked by learning:check. The local IIFE and ESM builds share src/lesson/index.ts. Optional client builds share src/engine-client/index.ts; the Node host uses src/engine-host/index.ts. The local CLI only substitutes its import path.

To update: check out the intended Kit commit, run npm ci, npm run bundle:lesson and npm run bundle:engine there, then run node scripts/vendor-learning-runtime.mjs --kit PATH --revision FULL_COMMIT_SHA here. Verify the provided revision matches that checkout and review the upstream changes. Run npm run learning:check, npm run learning:browser and npm run learning:connected-browser before committing. Never hand-edit the generated runtime, CLI, schema, or digests.
