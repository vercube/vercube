#!/usr/bin/env node
// Spike for the `vercube` umbrella package (#1488).
//
// Generates the list of subpath exports `vercube` would mirror, from the
// `exports` fields of the workspace packages. Mapping rule:
// `@vercube/<name>` -> `vercube/<name>`, and a subpath keeps its tail
// (`@vercube/queue/testing` -> `vercube/queue/testing`).
//
// `export *` does not carry a default export, so an entry that has one is
// marked: its mirror needs `export { default } from` as well.
//
// An export that is also the package's binary (`@vercube/cli`) is not mirrored:
// importing it runs the command line and exports nothing.
//
// The root entry (`vercube`) is the merge of ROOT below and is not in the list
// as a mirror; the packages merged into it also keep their own subpath.
// Nothing is written: step 2 of the issue turns this into the generator.
//
//   node scripts/umbrella/exports.mjs
//   node scripts/umbrella/exports.mjs --json

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(import.meta.dirname, '../..');
const json = process.argv.includes('--json');

// merged into the root entry (open question 1 of the issue)
export const ROOT = ['@vercube/core', '@vercube/di', '@vercube/logger'];

// not mirrored, per the issue: they stay as they are
export const EXCLUDED = { 'create-vercube': 'own binary, not a module', '@vercube/scan': 'internal build helper' };

// mirrored only if open question 3 of the issue is answered with yes
export const UNDECIDED = {
  '@vercube/devkit': 'open question 3',
  '@vercube/cli/toolkit': 'open question 3',
  '@vercube/cli/recipe': 'open question 3',
};

/**
 * Every export of every public workspace package, with what `vercube` does with it.
 */
export function collectExports() {
  const entries = [];

  for (const dir of readdirSync(join(repo, 'packages')).toSorted()) {
    const file = join(repo, 'packages', dir, 'package.json');

    if (!existsSync(file)) {
      continue;
    }

    const pkg = JSON.parse(readFileSync(file, 'utf8'));

    if (pkg.private) {
      continue;
    }

    if (EXCLUDED[pkg.name]) {
      entries.push({ source: pkg.name, status: 'excluded', reason: EXCLUDED[pkg.name] });
      continue;
    }

    for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
      if (subpath === './package.json') {
        continue;
      }

      const tail = subpath === '.' ? '' : subpath.slice(1);
      const source = `${pkg.name}${tail}`;
      const bins = Object.values(typeof pkg.bin === 'string' ? { bin: pkg.bin } : (pkg.bin ?? {}));
      const isBin = bins.some(
        (bin) => join(bin) === join(typeof target === 'string' ? target : (target.import ?? target.default)),
      );
      const reason = isBin ? 'the binary of the package, runs on import' : (UNDECIDED[source] ?? UNDECIDED[pkg.name]);
      const runtime = join(repo, 'packages', dir, typeof target === 'string' ? target : (target.import ?? target.default));
      const code = existsSync(runtime) ? readFileSync(runtime, 'utf8') : null;

      entries.push({
        source,
        subpath: `./${pkg.name.replace('@vercube/', '')}${tail}`,
        specifier: source.replace('@vercube/', 'vercube/'),
        package: pkg.name,
        // a string target has no `types` condition: TypeScript finds the sibling .d.mts
        conditions: typeof target === 'string' ? ['default'] : Object.keys(target),
        // null when the package is not built
        hasDefault: code === null ? null : /^export\s+default\b|^export\s*\{[^}]*\bas\s+default\b[^}]*\}/m.test(code),
        status: (isBin && 'excluded') || (reason && 'undecided') || 'mirrored',
        reason,
      });
    }
  }

  return entries;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const entries = collectExports();

  if (json) {
    console.log(JSON.stringify({ root: ROOT, entries }, null, 2));
  } else {
    const mirrored = entries.filter((entry) => entry.status === 'mirrored');
    const undecided = entries.filter((entry) => entry.status === 'undecided');
    const excluded = entries.filter((entry) => entry.status === 'excluded');
    const width = Math.max(...entries.map((entry) => (entry.specifier ?? entry.source).length));

    console.log(`vercube  <-  ${ROOT.join(' + ')}  (root entry, merged)\n`);
    console.log(`Mirrored subpaths: ${mirrored.length}`);

    for (const entry of mirrored) {
      console.log(`  ${entry.specifier.padEnd(width)}  <-  ${entry.source}${entry.hasDefault ? '  (+ default export)' : ''}`);
    }

    if (entries.some((entry) => entry.hasDefault === null)) {
      console.log('\n! some packages are not built: default exports were not detected, run `pnpm build` first');
    }

    console.log(`\nUndecided (mirrored only if the maintainer says so): ${undecided.length}`);

    for (const entry of undecided) {
      console.log(`  ${entry.specifier.padEnd(width)}  <-  ${entry.source}  (${entry.reason})`);
    }

    console.log(`\nNot mirrored: ${excluded.length}`);

    for (const entry of excluded) {
      console.log(`  ${entry.source.padEnd(width)}  ${entry.reason}`);
    }

    const packages = new Set(mirrored.map((entry) => entry.package));

    console.log(`\n${mirrored.length} mirrored subpaths from ${packages.size} packages, plus the root entry and ./package.json.`);
  }
}
