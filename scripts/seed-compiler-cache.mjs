/**
 * seed-compiler-cache.mjs
 *
 * Pre-seeds the Hardhat v3 compiler cache so that `hardhat compile` works
 * without internet access. Run automatically via the `postinstall` npm hook.
 *
 * Why this is needed:
 *   Hardhat always calls downloadSolcCompilers() before compilation, which
 *   tries to fetch a version manifest (list.json) from GitHub. If the cache
 *   already contains a list.json with the requested version AND the compiler
 *   binary, the download is skipped entirely.
 *
 * Strategy:
 *   - linux-amd64: stub list.json + empty placeholder binary + .does.not.work
 *     sentinel → Hardhat skips native download and falls back to WASM
 *   - wasm: real list.json + copy of node_modules/solc/soljson.js
 */

import { copyFile, mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Resolve Hardhat's global cache dir the same way Hardhat does internally.
async function getCompilersCacheDir() {
  const { getCacheDir } = await import(
    path.join(ROOT, 'node_modules/@nomicfoundation/hardhat-utils/dist/src/global-dir.js')
  );
  const cacheDir = await getCacheDir();
  return path.join(cacheDir, 'compilers-v3');
}

// Read the version string from the installed solc package.
function getSolcVersion() {
  const req = createRequire(import.meta.url);
  const soljson = req(path.join(ROOT, 'node_modules/solc/soljson.js'));
  const wrapper = req(path.join(ROOT, 'node_modules/solc/wrapper.js'));
  const full = wrapper(soljson).version(); // e.g. "0.8.24+commit.e11b9ed9.Emscripten.clang"
  const match = full.match(/^(\d+\.\d+\.\d+\+commit\.[0-9a-f]+)/);
  if (!match) throw new Error(`Cannot parse solc version string: ${full}`);
  return { version: match[1].split('+')[0], longVersion: match[1] };
}

async function seed() {
  const compilersDir = await getCompilersCacheDir();
  const { version, longVersion } = getSolcVersion();

  const wasmBuildPath = `soljson-v${longVersion}.js`;
  const nativeBuildPath = `solc-v${longVersion}`;
  const soljsonSrc = path.join(ROOT, 'node_modules/solc/soljson.js');

  const platforms = {
    'linux-amd64': {
      buildPath: nativeBuildPath,
      needsCompiler: false,
    },
    wasm: {
      buildPath: wasmBuildPath,
      needsCompiler: true,
    },
  };

  for (const [platform, { buildPath, needsCompiler }] of Object.entries(platforms)) {
    const platformDir = path.join(compilersDir, platform);
    await mkdir(platformDir, { recursive: true });

    const listPath = path.join(platformDir, 'list.json');
    if (!existsSync(listPath)) {
      const list = {
        builds: [
          {
            path: buildPath,
            version,
            longVersion,
            sha256: '0x' + '0'.repeat(64),
            // url must be present: Hardhat re-downloads any entry where
            // path starts with "solc-v" AND url is undefined (ARM64 backfill check).
            url: 'https://binaries.soliditylang.org/' + platform,
          },
        ],
        releases: { [version]: buildPath },
      };
      await writeFile(listPath, JSON.stringify(list, null, 2));
      console.log(`[seed-compiler-cache] wrote ${listPath}`);
    }

    const binaryPath = path.join(platformDir, buildPath);
    if (!existsSync(binaryPath)) {
      if (needsCompiler) {
        await copyFile(soljsonSrc, binaryPath);
        console.log(`[seed-compiler-cache] copied soljson → ${binaryPath}`);
      } else {
        // Empty placeholder — the .does.not.work sentinel makes Hardhat skip native
        await writeFile(binaryPath, '');
        const sentinelPath = `${binaryPath}.does.not.work`;
        await writeFile(sentinelPath, '');
        console.log(`[seed-compiler-cache] created native stub at ${binaryPath}`);
      }
    }
  }

  console.log('[seed-compiler-cache] done.');
}

seed().catch((err) => {
  console.error('[seed-compiler-cache] error:', err);
  // Non-fatal: don't break npm install if seeding fails
});
