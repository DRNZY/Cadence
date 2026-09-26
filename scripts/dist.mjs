#!/usr/bin/env node
/**
 * `npm run dist` — build and package for the current platform.
 *
 * The README documented `npm run dist`, but no such script existed. The real
 * packaging entry points were `build:linux`, `build:win` and `build:mac`, each
 * hardcoding a platform's electron-builder targets, so the documented command
 * failed with "Missing script: dist" while the working ones were undiscoverable
 * from the README.
 *
 * This script makes the documented command real. It runs the same
 * `npm run build` the other targets run, then picks electron-builder targets for
 * the host platform and calls electron-builder directly, so there is one code
 * path rather than a fourth hardcoded duplicate of the three that already exist.
 *
 * Flags:
 *   --dry-run   print what would run, run nothing
 *   --skip-build  package whatever is already in dist/ and dist-server/
 *   --targets "a,b"  override the inferred target list
 *   --dir       pass --dir to electron-builder (unpacked output, no installer)
 *
 * Targets per platform, matching the existing scripts:
 *   linux  AppImage, tar.gz, deb
 *   win32  nsis, zip
 *   darwin zip
 */

import { spawn } from 'node:child_process';
import process from 'node:process';

/** electron-builder target names per platform, as used by the existing scripts. */
const TARGETS = {
  linux: ['AppImage', 'tar.gz', 'deb'],
  win32: ['nsis', 'zip'],
  darwin: ['zip'],
};

function parseArgs(argv) {
  const options = { dryRun: false, skipBuild: false, dir: false, targets: null };
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--dry-run': options.dryRun = true; break;
      case '--skip-build': options.skipBuild = true; break;
      case '--dir': options.dir = true; break;
      case '--targets': {
        const value = argv[i + 1];
        if (!value) throw new Error('--targets needs a comma-separated value');
        options.targets = value.split(',').map((entry) => entry.trim()).filter(Boolean);
        i += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return options;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const platform = process.platform;
  const targets = options.targets ?? TARGETS[platform];

  if (!targets) {
    console.error(
      `No packaging targets are defined for platform "${platform}".\n`
      + '  Pass them explicitly: npm run dist -- --targets "zip"\n'
      + `  Known platforms: ${Object.keys(TARGETS).join(', ')}`,
    );
    return 1;
  }

  const steps = [];
  if (!options.skipBuild) {
    steps.push(['npm', ['run', 'build']]);
  }

  const builderArgs = [...(platform === 'win32' ? ['--win'] : platform === 'darwin' ? ['--mac'] : ['--linux'])];
  if (options.dir) builderArgs.push('--dir');
  else builderArgs.push(...targets);
  steps.push(['npx', ['electron-builder', ...builderArgs]]);

  console.log(`platform  ${platform}`);
  console.log(`targets   ${options.dir ? '--dir (unpacked)' : targets.join(', ')}`);
  if (options.skipBuild) {
    console.log('build     skipped, packaging existing dist/ and dist-server/');
  }

  // electron-builder packages `dist-server/**/*` (see electron-builder.json), so a
  // stale sibling in there ships. `build:server` emits index.mjs and
  // electron/main.cjs loads index.mjs; a leftover index.cjs from a CommonJS era
  // is dead weight that still gets bundled. Flag it rather than deleting it.
  const { readdir } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const serverDir = new URL('../dist-server/', import.meta.url).pathname;
  if (existsSync(serverDir)) {
    const entries = await readdir(serverDir);
    const stale = entries.filter((name) => name.endsWith('.cjs'));
    if (stale.length > 0) {
      console.log(
        `\nnote      dist-server/ also contains ${stale.join(', ')}, which nothing `
        + 'references.\n          build:server emits index.mjs and electron/main.cjs loads '
        + 'index.mjs.\n          electron-builder packages dist-server/**/*, so it will be '
        + 'included in the installer.\n          Remove it if you do not want it shipped.',
      );
    }
  }

  for (const [command, args] of steps) {
    console.log(`\n$ ${command} ${args.join(' ')}`);
    if (options.dryRun) {
      console.log('  (dry run, not executed)');
      continue;
    }
    await run(command, args);
  }

  if (options.dryRun) {
    console.log('\ndry run complete, nothing was built or packaged.');
  } else {
    console.log('\npackaged. Look in release/ for the installers.');
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`\ndist failed: ${error.message}`);
    process.exit(1);
  });
