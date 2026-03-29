Run a full project health check for the RAWagon monorepo and report the results in a clear summary table.

Execute these checks IN ORDER (stop on first fatal error):
1. `npm run lint:fix` — ESLint; report error count
2. `npx prettier --check .` — format check; list dirty files if any
3. `npm run typecheck` — tsc --noEmit; report errors
4. `npm test` — vitest; report pass/fail counts
5. `npm run compile` — compile-local.js; report compiled contract count or errors

After all checks, output a summary:

```
HEALTH CHECK — RAWagon
──────────────────────────────────────────
  Lint         ✓ / ✗  <detail>
  Format       ✓ / ✗  <detail>
  Typecheck    ✓ / ✗  <detail>
  Tests        ✓ / ✗  <N> passed / <N> failed
  Compile      ✓ / ✗  <N> contracts / errors
──────────────────────────────────────────
  Overall      PASS / FAIL
```

If any check fails, explain the root cause and suggest the fix. Do not auto-fix unless the user asks.
