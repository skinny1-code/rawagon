#!/usr/bin/env python3
"""
scripts/rebrand.py
Rebrand RAWagon → R3WAGON and RAWNet → R3NET across UI text, display
strings, comments, and docs. Internal code identifiers are preserved.

Protected (never touched):
  @rawagon/           npm package scope
  rawnet_testnet      hardhat/config key
  rawnet_mainnet      hardhat/config key
  RAWNET_RPC          env var name
  RAWNET_MAINNET_RPC  env var name
  WAGON_DEPLOYER_PK   env var name
  skinny1-code/rawagon GitHub repo path
  rawnet-sdk          folder/package name in paths
  rawagon-os          folder name in hrefs/requires
  rawagon/rawagon     path references
"""

import os
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── Protected substrings: lines containing these are skipped ──────────────────
PROTECTED = [
    "@rawagon/",
    "rawnet_testnet",
    "rawnet_mainnet",
    "RAWNET_RPC",
    "RAWNET_MAINNET_RPC",
    "WAGON_DEPLOYER_PK",
    "skinny1-code/rawagon",
    "rawagon/rawagon",         # github clone URLs
    "/rawnet-sdk",             # path references
    "rawnet-sdk/",
    "require('@rawagon",
    'require("@rawagon',
    "from '@rawagon",
    'from "@rawagon',
]

# ── Replacement pairs (longest first to avoid partial double-replace) ─────────
REPLACEMENTS = [
    ("RAWagon Systems LLC",  "R3WAGON Systems LLC"),
    ("RAWNet Testnet",       "R3NET Testnet"),
    ("RAWNet mainnet",       "R3NET mainnet"),
    ("RAWNet",               "R3NET"),
    ("RAWagon OS",           "R3WAGON OS"),
    ("RAWagon",              "R3WAGON"),
    ("rawagon.io",           "r3wagon.io"),
    # lowercase variant that appears in display copy
    ("Rawagon",              "R3WAGON"),
]

# ── File globs to process ─────────────────────────────────────────────────────
FILE_GLOBS = [
    # HTML apps (safe — no npm imports)
    "apps/**/*.html",
    "apps/*.html",
    # Root server + manifest
    "server.js",
    "manifest.json",
    # Core package source (comments + display strings)
    "packages/rawnet-sdk/index.js",
    "packages/migration-sdk/index.js",
    "packages/allcard-sdk/wallet-connect.js",
    "packages/allcard-sdk/connectors.js",
    "packages/allcard-sdk/index.js",
    "packages/allcard-sdk/index.ts",
    "packages/zk-identity/index.ts",
    "packages/zk-identity/index.js",
    "packages/zk-identity/authEngine.js",
    "packages/zk-identity/identity.js",
    "packages/zk-identity/vault.js",
    "packages/ltn-token/index.ts",
    "packages/ltn-token/index.js",
    "packages/fee-distributor/index.ts",
    "packages/fee-distributor/index.js",
    "packages/gold-oracle/index.ts",
    "packages/gold-oracle/index.js",
    "packages/contracts-sdk/contracts.js",
    "packages/migration-sdk/ONBOARDING.md",
    # Monitors (Python docstrings + comments)
    "packages/monitors/*.py",
    # Agents
    "agents/agent-system.js",
    "agents/README.md",
    # Solidity contracts (NatSpec + comments only — replacements skip code lines)
    "contracts/**/*.sol",
    "contracts/*.sol",
    # Tests
    "tests/**/*.js",
    "tests/*.js",
    # Hardhat + vitest config (comments only)
    "hardhat.config.js",
    "vitest.config.ts",
    # Docs
    "README.md",
    "SECURITY.md",
    # Config display fields
    "config/allocation.json",
    "deployed-addresses.json",
    "network/config/rawnet-chain.json",
    # Scripts (comments + display strings)
    "scripts/deploy.js",
    "scripts/deploy-ganache.js",
    "scripts/deploy-card-vault.js",
    "scripts/run-all-tests.js",
    "scripts/wallet-check.js",
    "scripts/solana-distribution.js",
    "network/scripts/deploy-rawnet.js",
]


def is_protected(line: str) -> bool:
    for p in PROTECTED:
        if p in line:
            return True
    return False


def process_file(path: str) -> bool:
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            original = f.read()
    except Exception as e:
        print(f"  SKIP (read error): {path}: {e}")
        return False

    lines = original.split("\n")
    new_lines = []
    changed = False

    for line in lines:
        if is_protected(line):
            new_lines.append(line)
            continue

        new_line = line
        for old, new in REPLACEMENTS:
            if old in new_line:
                new_line = new_line.replace(old, new)

        if new_line != line:
            changed = True
        new_lines.append(new_line)

    if changed:
        new_content = "\n".join(new_lines)
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        return True
    return False


def main():
    changed_files = []
    skipped = []

    seen = set()
    all_paths = []
    for pattern in FILE_GLOBS:
        full_pattern = os.path.join(ROOT, pattern)
        for path in glob.glob(full_pattern, recursive=True):
            if os.path.isfile(path) and path not in seen:
                seen.add(path)
                all_paths.append(path)

    print(f"Processing {len(all_paths)} files...\n")

    for path in sorted(all_paths):
        rel = os.path.relpath(path, ROOT)
        if process_file(path):
            changed_files.append(rel)
            print(f"  ✓  {rel}")
        else:
            skipped.append(rel)

    print(f"\n{'─'*60}")
    print(f"Changed : {len(changed_files)} files")
    print(f"No change: {len(skipped)} files")
    print("\nDone. RAWagon → R3WAGON, RAWNet → R3NET")


if __name__ == "__main__":
    main()
