import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { installDependencies } from 'nypm';
import { dirname, join } from 'pathe';
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

  /** The application, when it is a workspace member other than \`apps/api\`. */
  appDir?: string;

  /** The version `@vercube/*` packages are pinned to. */
  version: string;

  /** The built-in recipes. */
  recipes: RecipeTypes.Recipe<any>[];

  /** Answers to recipe questions given as flags, by flag name. */
  flags: Record<string, string | undefined>;

  /** The raw command line, for the questions of a package's own recipe, whose flags the CLI does not declare. */
  argv?: string[];

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

  const project = new Project(options.root, { version: options.version, appDir: options.appDir });

  assertAlias(project);
  assertVersion(project, options.version);

  const recipes = [...options.recipes];

  for (const id of ids) {
    if (!recipes.some((recipe) => recipe.id === id)) {
      recipes.push(await loadPackageRecipe(project, id));
    }
  }

  const answers: Record<string, Record<string, string>> = {};
  const missing: string[] = [];

  // the named recipes and every one they require: a flag for the required one counts too
  const pending = [...ids];

  while (pending.length > 0) {
    const id = pending.shift();
    const recipe = recipes.find((candidate) => candidate.id === id);

    if (!recipe || answers[recipe.id]) {
      continue;
    }

    answers[recipe.id] = {};

    for (const prompt of recipe.prompts ?? []) {
      let value = options.flags[prompt.flag] ?? flagFromArgv(options.argv ?? [], prompt.flag);

      if (value === undefined && options.interactive && !options.yes) {
        value = await options.prompter.select(prompt.message, prompt.options, prompt.default);
      } else if (value === undefined && !options.yes) {
        missing.push(`--${prompt.flag}`);
      }

      answers[recipe.id][prompt.name] = value ?? prompt.default;
    }

    const required =
      typeof recipe.requires === 'function' ? recipe.requires(answers[recipe.id] as never) : (recipe.requires ?? []);

    pending.push(...required);
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

  // also when a run that failed or was interrupted already wrote the dependencies
  if (options.install !== false && (summary.dependencies.length > 0 || hasUninstalled(project))) {
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

  // paths inherited through `extends` cannot be told from here; the build will
  if (!paths?.['@/*'] && JSON.parse(source).extends) {
    return;
  }

  // the recipes write their files under src/ and import them through @/
  const target = paths?.['@/*']?.[0]?.replace(/^\.\//, '');

  if (target && target !== 'src/*') {
    throw new RecipeError(
      `tsconfig.json maps @/* to ${paths!['@/*'][0]}, the recipes write their files under src/. Map @/* to ./src/*, or add the module by hand.`,
    );
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
  if (!/^(@[\w.-]+\/)?[\w.-]+$/.test(name) || name.split('/').some((segment) => /^\.+$/.test(segment) || segment === '@')) {
    throw new RecipeError(`Unknown module "${name}".`);
  }

  const dir = findPackage(project.appDir, name);

  if (!dir) {
    throw new RecipeError(
      `"${name}" is not a built-in module, and no package of that name is installed. Install it first, or pick a built-in module.`,
    );
  }

  const entry = recipeEntry(dir);

  if (!entry) {
    throw new RecipeError(`${name} does not export a recipe at ${name}/recipe.`);
  }

  const exported = (await import(pathToFileURL(join(dir, entry)).href)) as Record<string, any>;
  // an ES module's default or named export, or CommonJS module.exports with either
  const recipe = [exported.default, exported.recipe, exported.default?.default, exported.default?.recipe].find(
    (candidate) => typeof candidate?.apply === 'function',
  ) as RecipeTypes.Recipe<any> | undefined;

  if (!recipe) {
    throw new RecipeError(`${name}/recipe does not export a recipe made with defineRecipe().`);
  }

  // added by its package name, whatever id it declares
  return { ...recipe, id: name };
}

/**
 * Finds an installed package the way Node does, through the node_modules of
 * each directory up from the application.
 *
 * @param {string} from - The directory to start in
 * @param {string} name - The package name
 * @returns {string | null} Its directory
 */
function findPackage(from: string, name: string): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);

    if (existsSync(join(candidate, 'package.json'))) {
      return candidate;
    }

    if (dirname(dir) === dir) {
      return null;
    }
  }
}

/**
 * The file a package exports at `./recipe`, preferring the ES module
 * conditions: a recipe is imported, never required.
 *
 * @param {string} dir - The package directory
 * @returns {string | null} The file, relative to the package
 */
function recipeEntry(dir: string): string | null {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { exports?: unknown };
  const pick = (target: unknown): string | null => {
    if (typeof target === 'string') {
      return target;
    }

    if (Array.isArray(target)) {
      return target.map((item) => pick(item)).find(Boolean) ?? null;
    }

    if (target && typeof target === 'object') {
      for (const condition of ['import', 'node', 'module', 'default', 'require']) {
        const found = pick((target as Record<string, unknown>)[condition]);

        if (found) {
          return found;
        }
      }
    }

    return null;
  };

  if (pkg.exports !== undefined) {
    const exports =
      pkg.exports && typeof pkg.exports === 'object' && !Array.isArray(pkg.exports)
        ? (pkg.exports as Record<string, unknown>)
        : {};

    if ('./recipe' in exports) {
      return pick(exports['./recipe']);
    }

    // a subpath pattern such as "./*": "./dist/*.mjs"
    for (const [key, target] of Object.entries(exports)) {
      const star = key.indexOf('*');

      if (star !== -1 && './recipe'.startsWith(key.slice(0, star)) && './recipe'.endsWith(key.slice(star + 1))) {
        const match = './recipe'.slice(star, './recipe'.length - (key.length - star - 1));

        return pick(target)?.replaceAll('*', match) ?? null;
      }
    }

    // an exports map that does not list ./recipe hides every other file
    return null;
  }

  // no exports map: a file next to package.json
  return ['recipe.mjs', 'recipe.js', 'recipe.cjs'].find((file) => existsSync(join(dir, file))) ?? null;
}

/**
 * The value of a flag in a raw command line, `--name value` or `--name=value`.
 *
 * @param {string[]} argv - The command line
 * @param {string} name - The flag
 * @returns {string | undefined} Its value
 */
function flagFromArgv(argv: string[], name: string): string | undefined {
  for (const [index, arg] of argv.entries()) {
    if (arg.startsWith(`--${name}=`)) {
      return arg.slice(name.length + 3);
    }

    if (arg === `--${name}`) {
      const next = argv[index + 1];

      // given without a value: an error, not the default --yes would pick
      if (next === undefined || next.startsWith('-')) {
        throw new RecipeError(`--${name} needs a value.`);
      }

      return next;
    }
  }

  return undefined;
}

/**
 * Whether a dependency of the application is not installed, as after a run
 * that wrote package.json and then failed or was stopped.
 *
 * @param {Project} project - The project
 * @returns {boolean} True when one is missing
 */
function hasUninstalled(project: Project): boolean {
  const pkg = JSON.parse(project.read('package.json') ?? '{}') as Record<string, Record<string, string> | undefined>;
  const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

  return names.some((name) => !findPackage(project.appDir, name));
}

/**
 * The root of the project a directory belongs to: the closest directory up
 * from it that is a workspace (pnpm-workspace.yaml, or `workspaces` in
 * package.json), or else the directory itself. Running in `apps/api` of a
 * fullstack project works on the whole project.
 *
 * @param {string} cwd - The directory
 * @returns {string} The project root
 */
export function findProjectRoot(cwd: string): string {
  for (let dir = cwd; ; dir = dirname(dir)) {
    const manifest = join(dir, 'package.json');
    const isWorkspace =
      existsSync(join(dir, 'pnpm-workspace.yaml')) ||
      (existsSync(manifest) && Boolean((JSON.parse(readFileSync(manifest, 'utf8')) as { workspaces?: unknown }).workspaces));

    if (isWorkspace) {
      return dir;
    }

    if (dirname(dir) === dir) {
      return cwd;
    }
  }
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

/**
 * Fails when the project pins Vercube to another version than this CLI's:
 * a module of this version next to a core of another would run two copies of
 * core. A range (\`^1.4.0\`, \`latest\`) is left to the package manager.
 *
 * @param {Project} project - The project
 * @param {string} version - The CLI's version
 * @returns {void}
 * @throws {RecipeError} When an exact other version is pinned
 */
function assertVersion(project: Project, version: string): void {
  const pkg = JSON.parse(project.read('package.json') ?? '{}') as Record<string, Record<string, string> | undefined>;
  const core = pkg.dependencies?.['@vercube/core'] ?? pkg.devDependencies?.['@vercube/core'];

  if (core && /^\d+\.\d+\.\d+/.test(core) && core !== version) {
    throw new RecipeError(
      `The project uses @vercube/core ${core}, this CLI is ${version}. Run the project's own CLI (\`npx vercube add\`), or upgrade every @vercube package to ${version} first.`,
    );
  }
}
