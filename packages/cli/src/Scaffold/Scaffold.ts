import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { parseYAML, stringifyYAML } from 'confbox/yaml';
import { downloadTemplate } from 'giget';
import { installDependencies } from 'nypm';
import { join } from 'pathe';
import { x } from 'tinyexec';
import { applyRecipes } from '../Recipes/Apply';
import { listFiles, Project } from '../Recipes/Project';
import { DEFAULT_DEPLOY } from './Plan';
import { TEMPLATE_REGISTRY } from './Templates';
import type { RecipeTypes } from '../Recipes/RecipeTypes';
import type { InitPlan } from './Plan';
import type { PackageManagerName } from 'nypm';

/**
 * How a project is created, beyond the plan.
 */
export interface ScaffoldOptions {
  /** The absolute project directory. */
  dir: string;

  /** The version `@vercube/*` packages are pinned to. */
  version: string;

  /** Every recipe. */
  recipes: RecipeTypes.Recipe<any>[];

  /** Overwrite a directory that has files. */
  force?: boolean;

  /** Copy the template from this directory instead of downloading it. */
  templateDir?: string;

  /** Install dependencies. */
  install?: boolean;

  /** Run `git init`. */
  gitInit?: boolean;

  /** Reports progress. */
  log?: (message: string) => void;
}

/**
 * Creates a project: the template, with `@vercube/*` pinned to the CLI's
 * version and the recipes applied, then installs it, formats what the recipes
 * wrote and initializes git.
 *
 * @param {InitPlan} plan - What to create
 * @param {ScaffoldOptions} options - Where and how
 * @returns {Promise<RecipeTypes.Summary>} What the recipes changed
 */
export async function scaffoldProject(plan: InitPlan, options: ScaffoldOptions): Promise<RecipeTypes.Summary> {
  const log = options.log ?? (() => {});

  if (options.templateDir) {
    cpSync(options.templateDir, options.dir, {
      recursive: true,
      force: true,
      filter: (source) => !/[/\\](node_modules|\.git)([/\\]|$)/.test(source),
    });
  } else {
    await downloadTemplate(plan.template.registryName, {
      dir: options.dir,
      force: options.force,
      registry: TEMPLATE_REGISTRY,
    });
  }

  pinVercubePackages(options.dir, options.version);
  usePackageManager(options.dir, plan.packageManager);

  // locked to whatever the template was last installed with, not to what the
  // project depends on now; the install writes a fresh one
  rmSync(join(options.dir, 'pnpm-lock.yaml'), { force: true });

  const project = new Project(options.dir, { version: options.version });
  const selected = plan.deploy === DEFAULT_DEPLOY ? plan.modules : [...plan.modules, plan.deploy];
  const summary = await applyRecipes(project, selected, options.recipes, plan.answers);

  if (plan.packageManager === 'pnpm' && summary.builds.length > 0) {
    approveBuilds(options.dir, summary.builds);
  }

  if (options.install !== false) {
    log('Installing dependencies...');

    await installDependencies({
      cwd: options.dir,
      silent: true,
      packageManager: { name: plan.packageManager as PackageManagerName, command: plan.packageManager },
    });

    // magicast keeps the code valid, the project's own formatter makes it look written by hand
    const oxfmt = join(options.dir, 'node_modules', '.bin', 'oxfmt');

    if (existsSync(oxfmt) && summary.created.length + summary.updated.length > 0) {
      await x(oxfmt, [], { nodeOptions: { cwd: options.dir }, throwOnError: false });
    }
  }

  if (options.gitInit) {
    await x('git', ['init', '--quiet', options.dir], { throwOnError: false });
  }

  return summary;
}

/**
 * Approves the install scripts of packages in pnpm-workspace.yaml, where pnpm
 * reads them from. pnpm stops an install with an unapproved build script.
 *
 * @param {string} root - The project root
 * @param {string[]} packages - Package names
 * @returns {void}
 */
export function approveBuilds(root: string, packages: string[]): void {
  const path = join(root, 'pnpm-workspace.yaml');
  const workspace = (existsSync(path) ? parseYAML(readFileSync(path, 'utf8')) : null) as {
    allowBuilds?: Record<string, boolean>;
  } | null;
  const document = workspace ?? {};

  document.allowBuilds = { ...document.allowBuilds, ...Object.fromEntries(packages.map((name) => [name, true])) };
  writeFileSync(path, ensureNewline(stringifyYAML(document, { indent: 2 })));
}

/**
 * Prepares a project for the package manager it is created with. The
 * templates say `packageManager: pnpm@...`, which makes corepack refuse any
 * other one, so the field goes when another is chosen. Yarn berry installs
 * with Plug'n'Play by default, which neither TypeScript 7 nor the Vercube CLI
 * can resolve through, so it gets a node_modules linker.
 *
 * @param {string} root - The project root
 * @param {string} packageManager - The chosen package manager
 * @returns {void}
 */
export function usePackageManager(root: string, packageManager: string): void {
  const path = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { packageManager?: string };

  if (pkg.packageManager && !pkg.packageManager.startsWith(`${packageManager}@`)) {
    delete pkg.packageManager;
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  if (packageManager === 'yarn' && !existsSync(join(root, '.yarnrc.yml'))) {
    writeFileSync(join(root, '.yarnrc.yml'), 'nodeLinker: node-modules\n');
  }
}

/**
 * Pins the `@vercube/*` packages of every package.json in the project to a
 * version, so a project created today keeps building when the next release
 * ships. Templates list them as `latest`.
 *
 * @param {string} root - The project root
 * @param {string} version - The version
 * @returns {void}
 */
export function pinVercubePackages(root: string, version: string): void {
  const manifests = listFiles(root).filter((file) => file.endsWith('package.json') && !file.includes('node_modules'));

  for (const file of manifests) {
    const path = join(root, file);
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Record<string, string> | undefined>;
    let changed = false;

    for (const field of ['dependencies', 'devDependencies'] as const) {
      for (const name of Object.keys(pkg[field] ?? {})) {
        if (name.startsWith('@vercube/') && pkg[field]![name] !== version) {
          pkg[field]![name] = version;
          changed = true;
        }
      }
    }

    if (changed) {
      writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
    }
  }
}

/**
 * Formats the summary printed once the project is created: what was created,
 * which modules, what to start, and the next command. No wall of text.
 *
 * @param {InitPlan} plan - The plan
 * @param {RecipeTypes.Summary} summary - What the recipes changed
 * @param {string} relativeDir - The project directory, relative to the working directory
 * @returns {string[]} The lines
 */
export function formatSummary(plan: InitPlan, summary: RecipeTypes.Summary, relativeDir: string): string[] {
  const dev =
    { pnpm: 'pnpm dev', yarn: 'yarn dev', deno: 'deno task dev' }[plan.packageManager] ?? `${plan.packageManager} run dev`;
  const modules = summary.applied.filter((id) => id !== plan.deploy);
  const lines = [`Created ${relativeDir} from the ${plan.template.id} template`];

  if (modules.length > 0) {
    const implied = summary.implied.length > 0 ? ` (${summary.implied.join(', ')} added because another module needs it)` : '';

    lines.push(`Modules: ${modules.join(', ')}${implied}`);
  }

  if (plan.deploy !== DEFAULT_DEPLOY) {
    lines.push(`Deploy target: ${plan.deploy}`);
  }

  for (const note of summary.notes) {
    lines.push(note);
  }

  lines.push(`Next: ${relativeDir === '.' ? '' : `cd ${relativeDir} && `}${dev}`);

  return lines;
}

/**
 * Ends text with a newline, which the YAML printer leaves off.
 *
 * @param {string} text - The text
 * @returns {string} The text ending in a newline
 */
function ensureNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}
