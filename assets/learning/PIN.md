# Shared lesson runtime

Generated from [LearnerContextKit b857e361f643](https://github.com/sunnypatneedi/LearnerContextKit/commit/b857e361f643ecb1118c4ad2cc9b3a8ffdea6e11). MIT license is included beside the bundles.

This is the local formative-practice export only. No model provider, account, telemetry, or connected freshness is configured. Source repository access may require authorization; consuming these MIT-licensed vendored builds does not.

Files and SHA-256 digests are recorded in PIN.json and checked by learning:check. The IIFE and ESM builds come from the same src/lesson/index.ts entry point. The CLI only substitutes its import path.

To update: check out the intended Kit commit, run npm ci and npm run bundle:lesson there, then run node scripts/vendor-learning-runtime.mjs --kit PATH --revision FULL_COMMIT_SHA here. Verify the provided revision matches that checkout and review the upstream changes. Run npm run learning:check and npm run learning:browser before committing. Never hand-edit the generated runtime, CLI, schema, or digests.
