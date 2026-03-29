Compile all RAWagon Solidity contracts using the offline compiler.

Run:

```bash
npm run compile
```

This executes `contracts/compile-local.js` using the bundled `solc@0.8.26` npm package —
no network access required.

After compilation:

- List all compiled contracts with their source file paths
- Report any warnings (show first line only) or errors (show full message)
- If compilation fails, diagnose the error and suggest a fix

If the user passes `--hardhat` as an argument, run `cd contracts && npm run compile:hardhat` instead
(requires internet access to download the solc binary).

Artifacts are written to `contracts/artifacts/<ContractName>.json`.
