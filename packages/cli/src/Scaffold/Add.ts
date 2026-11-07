import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { installDependencies } from 'nypm';
import { join } from 'pathe';
import { x } from 'tinyexec';
import { applyRecipes } from '../Recipes/Apply';
import { Project } from '../Recipes/Project';
import { RecipeError } from '../Recipes/RecipeError';
import { approveBuilds } from './Scaffold';
import type { RecipeTypes } from '../Recipes/RecipeTypes';
import type { Prompter } from './Plan';
import type { PackageManagerName } from 'nypm';

/**
 * How `vercube add` runs, beyond the modules to add.
 */
export interface AddOptions {
  /** The project root. */
  root: string;

  /** The version `@vercube/*` packages are pinned to. */
  version: string;

  /** The built-in recipes. */
  recipes: RecipeTypes.Recipe<any>[];

  /** Answers to recipe questions given as flags, by flag name. */
  flags: Record<string, string | undefined>;

  /** Take the default for every question no flag answers. */
  yes: boolean;

  /** Whether questions can be asked. */
  interactive: boolean;

  /** Asks the questions. */
  prompter: Prompter;

  /** The package manager of the project. */
  packageManager: string;

  /** Install the dependencies the recipes added. */
  install?: boolean;

  /** Reports progress. */
  log?: (message: string) => void;
}

/**
 * Adds modules to an existing project, `vercube add queue,scheduler`: the
 * same recipes `vercube init` applies. A name that is not a built-in module is
 * looked up as a package exporting a recipe at `<name>/recipe`, so a
 * third-party module can ship its own.
 *
 * @param {string[]} ids - Modules, deploy targets or packages with a recipe
 * @param {AddOptions} options - The project and how to ask
 * @returns {Promise<RecipeTypes.Summary>} What was changed
 * @throws {RecipeError} When the project or a module cannot be handled, or answers are missing without a terminal
 */
export async function addModules(ids: string[], options: AddOptions): Promise<RecipeTypes.Summary> {
  if (ids.length === 0) {
    throw new RecipeError(
      `Name the modules to add, such as vercube add queue. Available: ${options.recipes.map((r) => r.id).join(', ')}.`,
    );
  }

  const project = new Project(options.root, { version: options.version });

  assertAlias(project);

  const recipes = [...options.recipes];

  for (const id of ids) {
    if (!recipes.some((recipe) => recipe.id === id)) {
      recipes.push(await loadPackageRecipe(project, id));
    }
  }

  const answers: Record<string, Record<string, string>> = {};
  const missing: string[] = [];

  for (const recipe of recipes.filter((candidate) => ids.includes(candidate.id))) {
    answers[recipe.id] = {};

    for (const prompt of recipe.prompts ?? []) {
      let value = options.flags[prompt.flag];

      if (value === undefined && options.interactive && !options.yes) {
        value = await options.prompter.select(prompt.message, prompt.options, prompt.default);
      } else if (value === undefined && !options.yes) {
        missing.push(`--${prompt.flag}`);
      }

      answers[recipe.id][prompt.name] = value ?? prompt.default;
    }
  }

  if (missing.length > 0) {
    throw new RecipeError(
      `Missing ${missing.join(', ')}. Pass them, or --yes for the defaults, when there is no terminal to ask in.`,
    );
  }

  const summary = await applyRecipes(project, ids, recipes, answers);

  if (options.packageManager === 'pnpm' && summary.builds.length > 0) {
    approveBuilds(project.root, summary.builds);
  }

  if (summary.dependencies.length > 0 && options.install !== false) {
    options.log?.('Installing dependencies...');

    await installDependencies({
      cwd: project.root,
      silent: true,
      packageManager: { name: options.packageManager as PackageManagerName, command: options.packageManager },
    });
  }

  // the edits are valid code; the project's formatter makes them read as written by hand
  const oxfmt = join(project.root, 'node_modules', '.bin', 'oxfmt');
  const changed = [...summary.created, ...summary.updated].filter((file) => /\.[cm]?[jt]s$/.test(file));

  if (existsSync(oxfmt) && changed.length > 0) {
    await x(oxfmt, changed, { nodeOptions: { cwd: project.root }, throwOnError: false });
  }

  return summary;
}

/**
 * Fails unless the project resolves `@/` the way the recipes' files import
 * with it. The templates map it to `src/`, an older or hand-made project may not.
 *
 * @param {Project} project - The project
 * @returns {void}
 * @throws {RecipeError} When tsconfig.json has no `@/*` path
 */
function assertAlias(project: Project): void {
  const source = project.read('tsconfig.json');

  if (source === null) {
    return;
  }

  let paths: Record<string, string[]> | undefined;

  try {
    paths = JSON.parse(source).compilerOptions?.paths;
  } catch {
    // tsconfig with comments: the recipes cannot tell, and the build will
    return;
  }

  if (!paths?.['@/*']) {
    throw new RecipeError(
      'The recipes import project files as @/..., which tsconfig.json does not map. Add "paths": { "@/*": ["./src/*"] } to its compilerOptions.',
    );
  }
}

/**
 * Loads the recipe a package ships at `<name>/recipe`, from the project's
 * node_modules: its default export, or an export named `recipe`.
 *
 * @param {Project} project - The project
 * @param {string} name - The package name
 * @returns {Promise<RecipeTypes.Recipe>} The recipe
 * @throws {RecipeError} When the package is not installed or ships no recipe
 */
async function loadPackageRecipe(project: Project, name: string): Promise<RecipeTypes.Recipe<any>> {
  if (!/^(@[\w.-]+\/)?[\w.-]+$/.test(name)) {
    throw new RecipeError(`Unknown module "${name}".`);
  }

  let path: string;

  try {
    path = createRequire(join(project.appDir, 'package.json')).resolve(`${name}/recipe`);
  } catch {
    throw new RecipeError(
      `"${name}" is not a built-in module, and no installed package of that name exports a recipe at ${name}/recipe. Install it first, or pick a built-in module.`,
    );
  }

  const exported = (await import(pathToFileURL(path).href)) as {
    default?: RecipeTypes.Recipe<any>;
    recipe?: RecipeTypes.Recipe<any>;
  };
  const recipe = exported.default ?? exported.recipe;

  if (!recipe || typeof recipe.apply !== 'function') {
    throw new RecipeError(`${name}/recipe does not export a recipe made with defineRecipe().`);
  }

  // added by its package name, whatever id it declares
  return { ...recipe, id: name };
}

/**
 * The package manager a project uses, from its lockfile or `packageManager` field.
 *
 * @param {string} root - The project root
 * @returns {string} Its name, `npm` when nothing says otherwise
 */
export function projectPackageManager(root: string): string {
  const field = existsSync(join(root, 'package.json'))
    ? (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { packageManager?: string }).packageManager
    : undefined;

  if (field) {
    return field.split('@')[0];
  }

  const lockfiles: [string, string][] = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['deno.lock', 'deno'],
    ['package-lock.json', 'npm'],
  ];

  return lockfiles.find(([file]) => existsSync(join(root, file)))?.[1] ?? 'npm';
}
