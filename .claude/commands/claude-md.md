Scan the entire RAWagon repository and update CLAUDE.md to reflect the current state of the codebase.

Follow this process:
1. Read the current CLAUDE.md to understand its structure
2. Check the actual files on disk:
   - `package.json` (root + each workspace) for scripts, deps, versions
   - `contracts/package.json` for contract deps
   - `packages/*/index.js` for exported functions/APIs
   - `contracts/src/**/*.sol` for contract interfaces
   - `vitest.config.mjs`, `eslint.config.mjs`, `tsconfig.json`, `.prettierrc` for tooling config
   - `.github/workflows/test.yml` for CI pipeline steps
   - `scripts/deploy.js` for deployment status
3. Identify anything in CLAUDE.md that is stale, wrong, or missing
4. Make targeted edits — do NOT rewrite sections that are still accurate
5. Run `npm run format` after edits to keep Prettier happy
6. Show a concise diff of what changed and why

Focus areas to verify: package versions, script commands, test counts, contract function signatures, known-incomplete areas table, and the repository structure tree.
