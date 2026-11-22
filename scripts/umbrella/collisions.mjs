#!/usr/bin/env node
// Spike for the `vercube` umbrella package (#1488).
//
// Lists every name that more than one of the packages merged into the root
// entry of `vercube` exports. `export *` from two modules that export the same
// name does not throw: the name is silently left out (unless both sides are the
// same binding), so a collision has to be found before the entry is written.
//
// Values come from the runtime exports of the built packages, types from the
// export lists of their built declarations (TypeScript 7 has no JavaScript API
// to ask). A collision is "same binding" when the values are identical objects
// or when the declarations re-export the name from the same place; only the
// others need a decision.
//
//   pnpm build
//   node scripts/umbrella/collisions.mjs
//   node scripts/umbrella/collisions.mjs core di logger client   # another set
//   node scripts/umbrella/collisions.mjs --json

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const json = args.includes('--json');
const names = args.filter((arg) => !arg.startsWith('--'));
const dirs = names.length > 0 ? names : ['core', 'di', 'logger'];

/**
 * The root entry of a workspace package: its name, runtime file and declaration file.
 */
function rootEntry(dir) {
  const pkg = JSON.parse(readFileSync(join(repo, 'packages', dir, 'package.json'), 'utf8'));
  const target = pkg.exports?.['.'];
  const runtime = typeof target === 'string' ? target : (target?.import ?? target?.default);
  const types = typeof target === 'string' ? target.replace(/\.mjs$/, '.d.mts') : target?.types;

  const files = { runtime: join(repo, 'packages', dir, runtime), types: join(repo, 'packages', dir, types) };

  for (const file of Object.values(files)) {
    if (!existsSync(file)) {
      throw new Error(`${file} is missing, run \`pnpm build\` first`);
    }
  }

  return { name: pkg.name, ...files };
}

/**
 * Splits `A, type B, C as D` into `{ local, exported, typeOnly }`.
 */
function parseSpecifiers(list, typeOnly) {
  return list
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const isType = typeOnly || part.startsWith('type ');
      const [local, exported = local] = part.replace(/^type\s+/, '').split(/\s+as\s+/);

      return { local, exported, typeOnly: isType };
    });
}

/**
 * The names a declaration file exports, each with where it comes from:
 * `<module>#<name>` for a re-export, `<package>#<name>` for a local declaration.
 */
function readDeclarations(file, packageName) {
  const source = readFileSync(file, 'utf8');
  const imported = new Map();
  const exported = new Map();
  const unresolved = [];

  for (const match of source.matchAll(/^import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["'];?/gm)) {
    for (const spec of parseSpecifiers(match[2], false)) {
      imported.set(spec.exported, `${match[3]}#${spec.local}`);
    }
  }

  for (const match of source.matchAll(/^import\s+(?:type\s+)?(?:\*\s+as\s+)?([\w$]+)\s+from\s+["']([^"']+)["'];?/gm)) {
    imported.set(match[1], `${match[2]}#*`);
  }

  // top-level declarations only: nested ones (inside a namespace) are indented
  const declaration =
    /^export\s+(?:declare\s+)?(?:abstract\s+)?(class|function|const|let|var|enum|namespace|type|interface)\s+([\w$]+)/gm;

  for (const match of source.matchAll(declaration)) {
    exported.set(match[2], { origin: `${packageName}#${match[2]}`, kind: match[1] });
  }

  for (const match of source.matchAll(/^export\s+(type\s+)?\{([^}]*)\}(?:\s+from\s+["']([^"']+)["'])?;?/gm)) {
    for (const spec of parseSpecifiers(match[2], Boolean(match[1]))) {
      const origin = match[3] ? `${match[3]}#${spec.local}` : (imported.get(spec.local) ?? `${packageName}#${spec.local}`);

      exported.set(spec.exported, { origin, kind: spec.typeOnly ? 'type' : 're-export' });
    }
  }

  for (const match of source.matchAll(/^export\s+\*\s+from\s+["']([^"']+)["'];?/gm)) {
    unresolved.push(match[1]);
  }

  return { exported, unresolved };
}

/**
 * Whether a name is a value everywhere, a type everywhere, or both.
 */
function kindOf(values, owners) {
  if (values === 0) {
    return 'type';
  }

  return values === owners ? 'value' : 'value in some, type in others';
}

const packages = [];

for (const dir of dirs) {
  const entry = rootEntry(dir);
  const runtime = await import(pathToFileURL(entry.runtime).href);
  const declarations = readDeclarations(entry.types, entry.name);

  packages.push({ ...entry, runtime, values: new Set(Object.keys(runtime)), ...declarations });
}

const allNames = new Set(packages.flatMap((pkg) => [...pkg.values, ...pkg.exported.keys()]));
const collisions = [];

for (const name of [...allNames].toSorted()) {
  const owners = packages.filter((pkg) => pkg.values.has(name) || pkg.exported.has(name));

  if (owners.length < 2) {
    continue;
  }

  const valueOwners = owners.filter((pkg) => pkg.values.has(name));
  const sameValue = valueOwners.length < 2 || valueOwners.every((pkg) => pkg.runtime[name] === valueOwners[0].runtime[name]);

  // the place a declaration comes from, followed through one re-export of another package of the set
  const origins = owners.map((pkg) => {
    const origin = pkg.exported.get(name)?.origin ?? `${pkg.name}#${name}`;
    const [from, local] = origin.split('#');
    const source = packages.find((other) => other.name === from && other !== pkg);

    return source?.exported.get(local)?.origin ?? origin;
  });
  const sameType = origins.every((origin) => origin === origins[0]);

  collisions.push({
    name,
    packages: owners.map((pkg) => pkg.name),
    kind: kindOf(valueOwners.length, owners.length),
    sameBinding: sameValue && sameType,
    origins: [...new Set(origins)],
  });
}

const unresolved = packages
  .filter((pkg) => pkg.unresolved.length > 0)
  .map((pkg) => ({ package: pkg.name, from: pkg.unresolved }));

if (json) {
  console.log(JSON.stringify({ packages: packages.map((pkg) => pkg.name), collisions, unresolved }, null, 2));
} else {
  console.log(`Root entry candidates: ${packages.map((pkg) => pkg.name).join(', ')}\n`);

  for (const pkg of packages) {
    console.log(`  ${pkg.name}: ${pkg.values.size} values, ${pkg.exported.size} names in the declarations`);
  }

  for (const [title, list] of [
    ['Real collisions (different bindings, `export *` would drop or mistype the name)', collisions.filter((c) => !c.sameBinding)],
    ['Same binding exported by more than one package (harmless with `export *`)', collisions.filter((c) => c.sameBinding)],
  ]) {
    console.log(`\n${title}: ${list.length}`);

    for (const collision of list) {
      console.log(`  ${collision.name}  [${collision.kind}]  ${collision.packages.join(', ')}`);
      console.log(`      from ${collision.origins.join('  vs  ')}`);
    }
  }

  for (const entry of unresolved) {
    console.log(`\n! ${entry.package} has \`export * from\` ${entry.from.join(', ')} in its declarations: names not followed`);
  }
}

process.exitCode = collisions.some((collision) => !collision.sameBinding) ? 1 : 0;
