# Editor Preview Debug + Smoke-50

## Root causes found

1. **Missing scaffold module** — `src/lib/templates/tanstack-start-scaffold.ts`
   was not present in the working tree. `patch-sandbox-preview-files.ts` imports
   it; without it the sandbox/WebContainer preview pipeline throws
   `ERR_MODULE_NOT_FOUND`.

2. **Test import extensions** — `lifemark-schema.test.ts` and
   `lifemark-sdk-runtime.test.ts` imported without `.ts` suffixes under
   Node ESM + `--experimental-strip-types`.

## Fixes applied

- Restored scaffold templates from repo archive.
- Normalized test imports to explicit `.ts` paths.
- Added `scripts/smoke-preview-50.mjs` + `npm run verify:preview-smoke`.

## Smoke result

```
target:  50
passed:  127
failed:  0
gate:    PASS
```
