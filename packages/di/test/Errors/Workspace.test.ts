import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ErrorCatalogDescription } from '../../src';

/**
 * Checks that hold for every package of the workspace. A package that has an
 * error catalog (`src/Errors/Catalog.ts`) gets its codes checked: they are
 * unique and documented, and their guidance is filled in. And no package
 * throws a bare `new Error(...)`, whether it has a catalog or not: one that
 * raises no error of its own needs no catalog.
 *
 * A package joins by having a `src` directory, so there is no list to keep.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const DOCS = join(ROOT, 'docs/2.core-features/7.errors.md');
const START = '<!-- codes:start -->';
const END = '<!-- codes:end -->';

/** A line that may create a plain error says why on itself or on the line above. */
const ALLOW = 'bare-error:';

interface Catalog {
  prefix: string;
  describe(): ErrorCatalogDescription[];
}

const catalogs: Array<{ package: string; catalog: Catalog }> = [];

/** Every package that has sources, with or without a catalog. */
const packages: string[] = [];

for (const name of readdirSync(join(ROOT, 'packages')).sort()) {
  if (!existsSync(join(ROOT, 'packages', name, 'src'))) {
    continue;
  }

  packages.push(name);

  const file = join(ROOT, 'packages', name, 'src/Errors/Catalog.ts');

  if (!existsSync(file)) {
    continue;
  }

  const exports = (await import(pathToFileURL(file).href)) as Record<string, unknown>;

  for (const value of Object.values(exports)) {
    if (typeof value === 'object' && value !== null && typeof (value as Catalog).describe === 'function') {
      catalogs.push({ package: name, catalog: value as Catalog });
    }
  }
}

catalogs.sort((a, b) => a.catalog.prefix.localeCompare(b.catalog.prefix));

const entries = catalogs.flatMap(({ catalog }) => catalog.describe());

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);

    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }

    return /\.(ts|tsx|vue)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

/**
 * The numbers of the lines that create a plain `Error`, with or without `new`,
 * and say nothing about why. Comment lines are skipped: documentation shows
 * errors in its examples.
 */
function findBareErrors(lines: string[]): number[] {
  const found: number[] = [];

  for (const [index, line] of lines.entries()) {
    if (!/(?<![\w$])(?:globalThis\.)?Error\(/.test(line.replaceAll(/\bnew\s+/g, '')) || /^\s*(\*|\/\/|\/\*)/.test(line)) {
      continue;
    }

    if (!line.includes(ALLOW) && !(lines[index - 1] ?? '').includes(ALLOW)) {
      found.push(index + 1);
    }
  }

  return found;
}

function renderCodes(): string {
  const sections = catalogs.map(({ package: name, catalog }) => {
    const errors = catalog
      .describe()
      .map((entry) =>
        [
          `#### ${entry.code}`,
          '',
          `\`${entry.message.replaceAll('`', "'")}\``,
          '',
          `**Why:** ${entry.why}`,
          '',
          `**Fix:** ${entry.fix}`,
        ].join('\n'),
      );

    return [`### @vercube/${name}`, '', errors.join('\n\n')].join('\n');
  });

  return sections.join('\n\n');
}

describe('error catalogs of the workspace', () => {
  it('finds the catalogs', () => {
    expect(catalogs.map(({ catalog }) => catalog.prefix)).toContain('VERCUBE_DI');
  });

  it('gives every error a code of its own, under the prefix of the framework', () => {
    const codes = entries.map((entry) => entry.code);

    expect(codes.filter((code, index) => codes.indexOf(code) !== index)).toEqual([]);
    expect(codes.filter((code) => !/^VERCUBE_[A-Z0-9]+(_[A-Z0-9]+)+$/.test(code))).toEqual([]);
  });

  it('gives every error a why and a fix that say something', () => {
    const vague = /check (your|the) (configuration|config|settings|setup)\.?$|see the docs\.?$|try again\.?$/i;
    const weak = entries.filter(
      (entry) => entry.why.trim().length < 30 || entry.fix.trim().length < 20 || vague.test(entry.fix.trim()),
    );

    expect(weak.map((entry) => entry.code)).toEqual([]);
  });

  it('keeps messages renderable for the reference', () => {
    expect(entries.filter((entry) => entry.message.length === 0).map((entry) => entry.code)).toEqual([]);
  });

  it('recognises a bare Error, and the comment that allows one', () => {
    const find = (text: string): number[] => findBareErrors(text.split('\n'));

    expect(find("throw new Error('x');")).toEqual([1]);
    expect(find("return Error('x');")).toEqual([1]);
    expect(find("const e = new globalThis.Error('x');")).toEqual([1]);
    expect(find('reject(new Error(`a ${b}`));')).toEqual([1]);
    expect(find("// bare-error: rethrown as it is\nthrow new Error('x');")).toEqual([]);
    expect(find("throw new Error('x'); // bare-error: the default class")).toEqual([]);
    expect(find("throw new TypeError('x');\nthrow new HttpError(500);\nError.captureStackTrace(e);")).toEqual([]);
    expect(find(" * throw new Error('in a doc comment');\n// new Error('in a comment')")).toEqual([]);
  });

  it('throws no bare Error in any package', () => {
    const offenders: string[] = [];
    let scanned = 0;

    for (const name of packages) {
      for (const file of sourceFiles(join(ROOT, 'packages', name, 'src'))) {
        scanned++;

        for (const line of findBareErrors(readFileSync(file, 'utf8').split('\n'))) {
          offenders.push(`${relative(ROOT, file)}:${line}`);
        }
      }
    }

    expect(scanned).toBeGreaterThan(0);
    // Use the package's catalog (`src/Errors/Catalog.ts`, added when the
    // package has none yet), or say why a plain error is right with a `// bare-error: <reason>` comment.
    expect(offenders).toEqual([]);
  });

  it('documents every code in docs/2.core-features/7.errors.md', () => {
    expect(existsSync(DOCS)).toBe(true);

    const page = readFileSync(DOCS, 'utf8');
    const start = page.indexOf(START);
    const end = page.indexOf(END);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const expected = `${page.slice(0, start + START.length)}\n\n${renderCodes()}\n\n${page.slice(end)}`;

    // `UPDATE_ERROR_DOCS=1 pnpm vitest run packages/di/test/Errors/Workspace.test.ts` rewrites the list
    if (process.env.UPDATE_ERROR_DOCS) {
      writeFileSync(DOCS, expected);
    }

    expect(readFileSync(DOCS, 'utf8')).toBe(expected);
  });
});
