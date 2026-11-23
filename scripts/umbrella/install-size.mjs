#!/usr/bin/env node
// Spike for the `vercube` umbrella package (#1488).
//
// Measures what every public package under `packages/*` adds to an install on
// top of `@vercube/core`, with the packages of this checkout: they are packed
// with `pnpm pack` (as `scripts/create-smoke.mjs` does), and each one is
// installed next to `@vercube/core` in a clean temporary project with pnpm.
// Every `@vercube/*` the install needs is overridden to its tarball, so nothing
// of the framework comes from the registry. Only those: pnpm installs an
// optional peer as soon as an override names it, which would add the CLI and
// the queue to `@vercube/scheduler`.
//
// - MB is the disk usage of `node_modules` (what `du` reports, hardlinks
//   counted once), minus the same for `@vercube/core` alone.
// - Packages is the number of distinct `name@version` in `node_modules/.pnpm`,
//   minus the same for `@vercube/core` alone.
// - "over telemetry" is the same on top of `@vercube/core` + `@vercube/telemetry`:
//   most modules depend on telemetry, so their own weight only shows there.
// - "no drivers" is the same install with `--no-optional`, for the packages
//   that get drivers (aws-sdk, bullmq, ...) through `optionalDependencies`.
//   `--no-optional` also drops the native bindings of oxc and rolldown, so the
//   figure is too low for a package that needs them (`@vercube/nitro`).
// - pnpm installs a required peer (`vite` for `@vercube/vite`) and skips
//   optional ones, as it would in an application.
// - Native packages (rolldown, oxc) ship one binary per platform: the numbers
//   are those of the machine the script runs on.
//
//   pnpm build
//   node scripts/umbrella/install-size.mjs
//   node scripts/umbrella/install-size.mjs --only queue,storage
//   node scripts/umbrella/install-size.mjs --json > sizes.json
//   node scripts/umbrella/install-size.mjs --markdown

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const repo = resolve(import.meta.dirname, '../..');

const { values: options } = parseArgs({
  options: {
    only: { type: 'string' },
    json: { type: 'boolean', default: false },
    markdown: { type: 'boolean', default: false },
  },
});

const BASE = '@vercube/core';
const TELEMETRY = '@vercube/telemetry';

// the root entry of `vercube`, plus the client: needed by every application
const TIER_1 = new Set(['@vercube/core', '@vercube/di', '@vercube/logger', '@vercube/client']);

// used to build, run in development or test an application, never by the deployed one
const DEV_ONLY = new Set(['@vercube/cli', '@vercube/devkit', '@vercube/vite', '@vercube/scan', '@vercube/testing']);

// not part of the umbrella at all (see scripts/umbrella/exports.mjs)
const NOT_MIRRORED = new Set(['create-vercube', '@vercube/scan']);

// the rule of thumb of the issue: more than about 5 MB on top of core is tier 3
const TIER_3_MB = 5;

// packages that belong together when naming what an install is made of
const FAMILIES = [
  [/^@opentelemetry\//, 'opentelemetry'],
  [/^(@aws-sdk|@smithy|@aws-crypto|@aws)\//, 'aws-sdk'],
  [/^(rolldown$|@rolldown\/)/, 'rolldown'],
  [/^(oxc-|@oxc-)/, 'oxc'],
  [/^@scalar\//, 'scalar'],
  [/^@vercube\//, '@vercube/*'],
  [/^(vite$|@vitejs\/)/, 'vite'],
  [/^(nitro$|@nitro\/)/, 'nitro'],
  [/^(@babel|@types|@protobufjs|@img|@parcel|@napi-rs|@esbuild|@unhead|@vue)\//, null],
];

const log = (message) => process.stderr.write(`${message}\n`);

const family = (name) => {
  for (const [pattern, label] of FAMILIES) {
    if (pattern.test(name)) {
      return label ?? name.split('/')[0];
    }
  }

  return name;
};

/**
 * Disk usage of a directory in bytes, the way `du` counts it: allocated blocks,
 * a hardlinked file once, symlinks not followed.
 */
function diskUsage(dir, seen = new Set()) {
  let bytes = 0;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const stat = lstatSync(path);

    if (stat.isDirectory()) {
      bytes += stat.blocks * 512 + diskUsage(path, seen);
    } else if (!seen.has(stat.ino)) {
      seen.add(stat.ino);
      bytes += stat.blocks * 512;
    }
  }

  return bytes;
}

/**
 * Packs every public package of the workspace, returns `{ name: 'file:/…tgz' }`.
 */
function pack(destination) {
  const tarballs = {};

  for (const dir of readdirSync(join(repo, 'packages'))) {
    const manifest = join(repo, 'packages', dir, 'package.json');

    if (!existsSync(manifest)) {
      continue;
    }

    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));

    if (pkg.private) {
      continue;
    }

    if (!existsSync(join(repo, 'packages', dir, 'dist')) && pkg.files?.includes('dist')) {
      throw new Error(`packages/${dir}/dist is missing, run \`pnpm build\` first`);
    }

    const before = new Set(readdirSync(destination));

    execFileSync('pnpm', ['pack', '--pack-destination', destination], { cwd: join(repo, 'packages', dir), stdio: 'ignore' });

    const file = readdirSync(destination).find((name) => !before.has(name));

    tarballs[pkg.name] = { spec: `file:${join(destination, file)}`, manifest: pkg };
  }

  return tarballs;
}

/**
 * The workspace packages `names` install: themselves and their dependencies, not their peers.
 */
function closure(names, tarballs) {
  const found = new Set();
  const queue = [...names];

  while (queue.length > 0) {
    const name = queue.pop();

    if (found.has(name) || !tarballs[name]) {
      continue;
    }

    found.add(name);

    const { dependencies = {}, optionalDependencies = {} } = tarballs[name].manifest;

    queue.push(...Object.keys(dependencies), ...Object.keys(optionalDependencies));
  }

  return [...found].toSorted();
}

/**
 * Installs `names` into a clean project and measures its `node_modules`.
 */
function measure(root, label, names, tarballs, extraArgs = []) {
  const dir = join(root, label.replaceAll(/[^\w.-]+/g, '_'));

  mkdirSync(dir, { recursive: true });

  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'install-size',
        private: true,
        type: 'module',
        dependencies: Object.fromEntries(names.map((name) => [name, tarballs[name].spec])),
      },
      null,
      2,
    )}\n`,
  );

  // this checkout's packages instead of the published ones, for transitive dependencies too
  const overrides = closure(names, tarballs)
    .map((name) => `  '${name}': ${tarballs[name].spec}`)
    .join('\n');

  writeFileSync(join(dir, 'pnpm-workspace.yaml'), `packages: []\noverrides:\n${overrides}\n`);

  execFileSync('pnpm', ['install', '--prod', '--ignore-scripts', ...extraArgs], {
    cwd: dir,
    stdio: 'ignore',
    env: { ...process.env, CI: '1' },
  });

  const store = join(dir, 'node_modules/.pnpm');
  const packages = new Map();
  const families = new Map();
  const seen = new Set();

  for (const entry of readdirSync(store)) {
    // `@scope+name@1.2.3_peer@4.5.6` or `@vercube+core@file+…`
    const match = entry.match(/^(@[^+]+\+[^@]+|[^@]+)@([^_]+)/);

    if (!match || !lstatSync(join(store, entry)).isDirectory() || entry === 'node_modules') {
      continue;
    }

    const name = match[1].replace('+', '/');
    const bytes = diskUsage(join(store, entry), seen);

    if (name.startsWith('@vercube/') && !match[2].startsWith('file+')) {
      throw new Error(`${name} was installed from the registry (${entry}), not from this checkout`);
    }

    if (name.startsWith('@vercube/') && !closure(names, tarballs).includes(name)) {
      throw new Error(`${name} was installed for ${names.join(' + ')}, which does not depend on it`);
    }

    packages.set(`${name}@${match[2]}`, (packages.get(`${name}@${match[2]}`) ?? 0) + bytes);
    families.set(family(name), (families.get(family(name)) ?? 0) + bytes);
  }

  const result = { bytes: diskUsage(join(dir, 'node_modules')), packages: packages.size, families: Object.fromEntries(families) };

  rmSync(dir, { recursive: true, force: true });

  return result;
}

const MB = 1024 * 1024;
const toMB = (bytes) => Math.round((bytes / MB) * 10) / 10;

/**
 * What an install has that the baseline has not, biggest first.
 */
function contributors(result, baseline) {
  return Object.entries(result.families)
    .map(([name, bytes]) => [name, bytes - (baseline.families[name] ?? 0)])
    .filter(([name, bytes]) => name !== '@vercube/*' && bytes > 0.3 * MB)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, bytes]) => `${name} ${toMB(bytes)}`);
}

const temp = mkdtempSync(join(tmpdir(), 'vercube-install-size-'));
const report = { platform: `${process.platform}-${process.arch}`, base: BASE, rows: [], sets: [] };

try {
  log('Packing the packages');

  const tarballsDir = join(temp, 'tarballs');

  mkdirSync(tarballsDir);

  const tarballs = pack(tarballsDir);
  const only = options.only
    ?.split(',')
    .map((name) => (name.includes('/') || name === 'create-vercube' ? name : `@vercube/${name}`));
  const names = Object.keys(tarballs)
    .filter((name) => name !== BASE && (!only || only.includes(name)))
    .toSorted();

  log(`Installing ${BASE}`);

  const baseline = measure(temp, 'base', [BASE], tarballs);
  const bareBaseline = measure(temp, 'base-no-optional', [BASE], tarballs, ['--no-optional']);

  log(`Installing ${BASE} + ${TELEMETRY}`);

  const telemetry = measure(temp, 'telemetry', [BASE, TELEMETRY], tarballs);

  report.baseline = { mb: toMB(baseline.bytes), packages: baseline.packages };
  report.telemetry = { mb: toMB(telemetry.bytes), packages: telemetry.packages };

  for (const name of names) {
    log(`Installing ${BASE} + ${name}`);

    const installed = closure([name], tarballs);
    const full = measure(temp, name, [BASE, name], tarballs);
    // an install that has telemetry anyway is compared with core + telemetry
    const floor = installed.includes(TELEMETRY) ? telemetry : baseline;
    const row = {
      package: name,
      mb: toMB(full.bytes - baseline.bytes),
      packages: full.packages - baseline.packages,
      overTelemetry: { mb: toMB(full.bytes - floor.bytes), packages: full.packages - floor.packages },
      contributors: contributors(full, baseline),
    };

    // drivers declared as optionalDependencies, by the package or by one it depends on, are installed by default
    const drivers = installed.flatMap((dep) => Object.keys(tarballs[dep].manifest.optionalDependencies ?? {}));

    if (drivers.length > 0) {
      const bare = measure(temp, `${name}-no-optional`, [BASE, name], tarballs, ['--no-optional']);

      row.drivers = [...new Set(drivers)].toSorted();
      row.withoutDrivers = {
        mb: toMB(bare.bytes - bareBaseline.bytes),
        packages: bare.packages - bareBaseline.packages,
        overTelemetry: toMB(bare.bytes - bareBaseline.bytes - (floor.bytes - baseline.bytes)),
      };
    }

    // tier by the rule of the issue, then what it would be with telemetry and the drivers out of the way
    const own = row.withoutDrivers?.overTelemetry ?? row.overTelemetry.mb;

    if (NOT_MIRRORED.has(name)) {
      row.tier = null;
      row.why = 'not mirrored';
    } else if (TIER_1.has(name)) {
      row.tier = 1;
      row.why = 'every app';
    } else if (DEV_ONLY.has(name)) {
      row.tier = 3;
      row.why = 'dev-time only';
    } else if (row.mb <= TIER_3_MB) {
      row.tier = 2;
      row.why = 'light';
    } else {
      row.tier = 3;
      row.tierWithTelemetry = own <= TIER_3_MB ? 2 : 3;
      row.why =
        own > TIER_3_MB
          ? `> ${TIER_3_MB} MB of its own`
          : `> ${TIER_3_MB} MB only through ${[installed.includes(TELEMETRY) && 'telemetry', row.drivers && 'drivers'].filter(Boolean).join(' and ')}`;
    }

    report.rows.push(row);
  }

  // what `vercube` itself would install, for the candidate splits
  if (!only) {
    const strict = report.rows.filter((row) => row.tier === 1 || row.tier === 2).map((row) => row.package);
    const relaxed = report.rows
      .filter((row) => row.tier === 1 || row.tier === 2 || row.tierWithTelemetry === 2)
      .map((row) => row.package);
    const mirrored = report.rows.filter((row) => row.tier !== null).map((row) => row.package);

    for (const [label, set, extraArgs] of [
      ['A. tier 1 + 2 by the 5 MB rule', strict, []],
      ['B. A + telemetry and the modules that only weigh through it', relaxed, []],
      ['C. B without the drivers (--no-optional)', relaxed, ['--no-optional']],
      ['D. everything (naive umbrella)', mirrored, []],
    ]) {
      log(`Installing the set: ${label}`);

      const result = measure(temp, `set-${label}`, [BASE, ...set], tarballs, extraArgs);

      report.sets.push({
        label,
        members: set.map((name) => name.replace('@vercube/', '')),
        mb: toMB(result.bytes),
        packages: result.packages,
        contributors: contributors(result, { families: {} }),
      });
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const signed = (value) => `+${value.toFixed(1)}`;
  const tierLabel = (row) => {
    if (row.tier === null) {
      return '-';
    }

    return row.tierWithTelemetry === 2 ? '3 (2 in split B)' : String(row.tier);
  };
  const header = ['Package', 'MB', 'Packages', 'MB over telemetry', 'MB, no drivers', 'Biggest contributors (MB)', 'Tier', 'Why'];
  const rows = report.rows.map((row) => [
    row.package,
    signed(row.mb),
    `+${row.packages}`,
    row.overTelemetry.mb === row.mb ? '' : signed(row.overTelemetry.mb),
    row.withoutDrivers ? `${signed(row.withoutDrivers.mb)} (+${row.withoutDrivers.packages})` : '',
    row.contributors.join(', '),
    tierLabel(row),
    row.why,
  ]);
  const setHeader = ['Set installed together', 'MB', 'Packages', 'Biggest contributors (MB)'];
  const setRows = report.sets.map((set) => [set.label, set.mb.toFixed(1), String(set.packages), set.contributors.join(', ')]);

  const table = (head, body) => {
    if (options.markdown) {
      return [head, head.map(() => '---'), ...body].map((cells) => `| ${cells.join(' | ')} |`).join('\n');
    }

    const widths = head.map((cell, index) => Math.max(cell.length, ...body.map((line) => line[index].length)));

    return [head, ...body].map((cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ')).join('\n');
  };

  console.log(`Baseline: ${BASE} alone is ${report.baseline.mb} MB, ${report.baseline.packages} packages (${report.platform})`);
  console.log(`${BASE} + ${TELEMETRY} is ${report.telemetry.mb} MB, ${report.telemetry.packages} packages\n`);
  console.log(table(header, rows));

  if (setRows.length > 0) {
    console.log(`\n${table(setHeader, setRows)}\n`);

    for (const set of report.sets) {
      console.log(`${set.label.slice(0, 2)} ${set.members.join(', ')}`);
    }
  }
}
