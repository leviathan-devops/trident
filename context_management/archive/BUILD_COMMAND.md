# Build Command — Exact Configuration

## Command
```bash
bun run build
```

## What It Runs (from package.json)
```
esbuild src/index.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --target=node20 \
  --outfile=dist/index.js \
  --sourcemap \
  --external:@opencode-ai/plugin \
  --external:zod \
  --external:xstate \
  --external:@xstate/fsm \
  --banner:js="import{createRequire as __cr}from'module';import{fileURLToPath as __ftp}from'url';import{dirname as __dn}from'path';const require=__cr(import.meta.url);const __filename=__ftp(import.meta.url);const __dirname=__dn(__filename);"
```

## CRITICAL: Do NOT Use
- `npx esbuild index.ts` (wrong — this is the stale src/package.json command)
- `bun build src/index.ts --target bun` (wrong target — need node20 not bun)
- Missing `--banner:js` (CJS polyfill required for xstate, peggy, sql.js)
- Missing `--external:xstate` (must be external, not bundled)

## The Banner (CJS Polyfill)
Without the banner, `require()` is undefined in ESM context.
xstate, peggy, and sql.js all use `require()` internally.
The banner creates `require` from `createRequire(import.meta.url)`.
ALWAYS include this banner. Without it, the plugin crashes at runtime.

## Verification
```bash
# After build:
ls -lh dist/index.js     # Should be ~14.5MB
ls -lh dist/index.js.map # Should exist (~20.5MB)
head -c 80 dist/index.js  # First line should be the banner (import{createRequire...)
```
