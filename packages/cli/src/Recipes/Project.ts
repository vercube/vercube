import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseYAML, stringifyYAML } from 'confbox/yaml';
import { builders, generateCode, parseModule } from 'magicast';
import { getDefaultExportOptions } from 'magicast/helpers';
import { dirname, isAbsolute, join, relative } from 'pathe';
import { RecipeError } from './RecipeError';
import type { RecipeTypes } from './RecipeTypes';

/** A module parsed by magicast. */
type Module = ReturnType<typeof parseModule>;

/** The file a Vercube app is configured in. */
const CONFIG_FILE = 'vercube.config.ts';

/** Where the starter templates set up the container. */
const CONTAINER_FILE = 'src/boot/Container.ts';

/** Where a fullstack template keeps the Vercube app. */
const FULLSTACK_APP_DIR = 'apps/api';

/** Where a fullstack template keeps the web app. */
const FULLSTACK_WEB_DIR = 'apps/web';

/**
 * A project recipes are applied to: the files of a fresh template, or of an
 * existing application for `vercube add`.
 *
 * Every helper is idempotent: it checks what is there before it adds
 * anything, so applying a recipe twice changes nothing. Code is edited through
 * its syntax tree (magicast), never by concatenating strings, so the edits
 * survive a project that no longer looks like the template.
 */
export class Project {
  /** The project root, where the lockfile and docker-compose.yml live. */
  public readonly root: string;

  /** The Vercube application: the root, or `apps/api` in a fullstack project. */
  public readonly appDir: string;

  /** The web application of a fullstack project, null otherwise. */
  public readonly webDir: string | null;

  /** The version `@vercube/*` packages are pinned to. */
  public readonly version: string;

  /** What changed, for the summary. */
  private readonly fSummary: Omit<RecipeTypes.Summary, 'applied' | 'implied'> = {
    created: [],
    updated: [],
    dependencies: [],
    services: [],
    notes: [],
  };

  /**
   * @param {string} root - The project root
   * @param {object} options - Project settings
   * @param {string} options.version - The version `@vercube/*` packages are pinned to
   * @throws {RecipeError} When the directory holds no Vercube application
   */
  constructor(root: string, options: { version: string }) {
    this.root = root;
    this.version = options.version;

    if (existsSync(join(root, FULLSTACK_APP_DIR, 'package.json'))) {
      this.appDir = join(root, FULLSTACK_APP_DIR);
      this.webDir = existsSync(join(root, FULLSTACK_WEB_DIR, 'package.json')) ? join(root, FULLSTACK_WEB_DIR) : null;
    } else if (existsSync(join(root, 'package.json'))) {
      this.appDir = root;
      this.webDir = null;
    } else {
      throw new RecipeError(`No package.json in ${root}. Run this in the root of a Vercube project.`);
    }

    // a recipe must not wire Vercube into a package that is something else
    const pkg = JSON.parse(readFileSync(join(this.appDir, 'package.json'), 'utf8')) as Record<
      string,
      Record<string, string> | undefined
    >;

    if (!pkg.dependencies?.['@vercube/core'] && !pkg.devDependencies?.['@vercube/core']) {
      throw new RecipeError(
        `${relative(root, join(this.appDir, 'package.json'))} does not depend on @vercube/core. Run this in a Vercube project.`,
      );
    }
  }

  /**
   * The layout of the project: a single API, a workspace with the API in
   * `apps/api`, or such a workspace with a web app in `apps/web` too.
   */
  public get layout(): 'api' | 'workspace' | 'fullstack' {
    if (this.appDir === this.root) {
      return 'api';
    }

    return this.webDir ? 'fullstack' : 'workspace';
  }

  /**
   * What the helpers changed so far.
   */
  public get summary(): Omit<RecipeTypes.Summary, 'applied' | 'implied'> {
    return {
      created: [...this.fSummary.created],
      updated: [...this.fSummary.updated],
      dependencies: [...this.fSummary.dependencies],
      services: [...this.fSummary.services],
      notes: [...this.fSummary.notes],
    };
  }

  /**
   * Whether a file of the application exists.
   *
   * @param {string} file - Path relative to the application
   * @returns {boolean} True when it exists
   */
  public exists(file: string): boolean {
    return existsSync(this.appPath(file));
  }

  /**
   * Reads a file of the application.
   *
   * @param {string} file - Path relative to the application
   * @returns {string | null} Its content, null when it does not exist
   */
  public read(file: string): string | null {
    const path = this.appPath(file);

    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  }

  /**
   * Creates a file of the application. An existing file is left alone: it may
   * be the user's own, and a recipe applied again must not undo their edits.
   *
   * @param {string} file - Path relative to the application
   * @param {string} content - The content
   * @returns {boolean} Whether the file was created
   */
  public createFile(file: string, content: string): boolean {
    const path = this.appPath(file);

    if (existsSync(path)) {
      return false;
    }

    this.write(path, content);

    return true;
  }

  /**
   * Adds dependencies to the application's package.json, leaving the ones it
   * already has. `@vercube/*` packages are pinned to {@link Project.version}.
   *
   * @param {RecipeTypes.Dependencies} dependencies - Name to version range
   * @param {object} [options] - Where to add them
   * @param {boolean} [options.dev] - Add them as devDependencies
   * @returns {void}
   */
  public addDependencies(dependencies: RecipeTypes.Dependencies, options: { dev?: boolean } = {}): void {
    this.editJson(join(this.appDir, 'package.json'), (pkg) => {
      const runtime = { ...(pkg.dependencies as Record<string, string> | undefined) };
      const dev = { ...(pkg.devDependencies as Record<string, string> | undefined) };
      let changed = false;

      for (const [name, range] of Object.entries(dependencies)) {
        if (runtime[name] !== undefined || (options.dev && dev[name] !== undefined)) {
          continue;
        }

        // needed at runtime but only installed for development: a production
        // install would leave it out, so it moves
        if (dev[name] !== undefined) {
          runtime[name] = dev[name];
          delete dev[name];
          changed = true;
          continue;
        }

        (options.dev ? dev : runtime)[name] = name.startsWith('@vercube/') ? this.version : range;
        this.fSummary.dependencies.push(name);
        changed = true;
      }

      if (changed) {
        pkg.dependencies = sortKeys(runtime);
        pkg.devDependencies = sortKeys(dev);
      }

      return changed;
    });
  }

  /**
   * Adds a script to the application's package.json, unless one by that name
   * exists.
   *
   * @param {string} name - Script name
   * @param {string} command - The command
   * @returns {void}
   */
  public addScript(name: string, command: string): void {
    this.editJson(join(this.appDir, 'package.json'), (pkg) => {
      const scripts = (pkg.scripts ?? {}) as Record<string, string>;

      if (scripts[name] !== undefined) {
        return false;
      }

      pkg.scripts = { ...scripts, [name]: command };

      return true;
    });
  }

  /**
   * Adds environment variables to `.env.example`, which is committed, and to
   * `.env`, which the app reads in development. A variable already in a file
   * keeps its value.
   *
   * @param {Record<string, string>} variables - Name to value
   * @param {string} [comment] - Line written above them, such as the module name
   * @param {Record<string, string>} [example] - Values for `.env.example` where they differ, such as a placeholder for a generated secret
   * @returns {void}
   * @throws {RecipeError} When a value spans lines, which would write a second variable
   */
  public addEnv(variables: Record<string, string>, comment?: string, example: Record<string, string> = {}): void {
    for (const [name, value] of Object.entries({ ...variables, ...example })) {
      if (/[\n\r]/.test(value)) {
        throw new RecipeError(`The value of ${name} spans lines, which .env cannot hold.`);
      }
    }

    for (const file of ['.env.example', '.env']) {
      const values = file === '.env.example' ? { ...variables, ...example } : variables;
      const path = join(this.appDir, file);
      const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
      const present = new Set(
        current
          .split('\n')
          .map((line) => /^\s*(?:export\s+)?([\w.]+)\s*=/.exec(line)?.[1])
          .filter(Boolean),
      );
      const missing = Object.entries(values).filter(([name]) => !present.has(name));

      if (missing.length === 0) {
        continue;
      }

      const block = [comment ? `# ${comment}` : null, ...missing.map(([name, value]) => `${name}=${value}`)]
        .filter(Boolean)
        .join('\n');
      const separator = separatorAfter(current);

      this.write(path, `${current}${separator}${block}\n`);
    }
  }

  /**
   * Adds a service to `docker-compose.yml` at the project root, unless one by
   * that name exists.
   *
   * @param {string} name - Service name, such as `redis`
   * @param {RecipeTypes.ComposeService} service - The service definition
   * @returns {void}
   */
  public addComposeService(name: string, service: RecipeTypes.ComposeService): void {
    const path = join(this.root, 'docker-compose.yml');
    const compose = (existsSync(path) ? parseYAML(readFileSync(path, 'utf8')) : null) as {
      services?: Record<string, unknown>;
    } | null;
    const document = compose ?? {};

    if (document.services?.[name] !== undefined) {
      return;
    }

    document.services = { ...document.services, [name]: service };
    this.write(path, stringifyYAML(document, { indent: 2 }));
    this.fSummary.services.push(name);
  }

  /**
   * Registers a plugin in `vercube.config.ts`: imports it and adds
   * `[Plugin, options]` to `plugins`. A plugin already listed is left alone.
   *
   * @param {object} plugin - The plugin
   * @param {string} plugin.name - The class name, such as `QueuePlugin`
   * @param {string} plugin.from - The module it is imported from
   * @param {string} [plugin.options] - The options, as code: `{ autoStart: false }`
   * @param {Record<string, string>} [plugin.imports] - Other names the options use, name to module
   * @returns {void}
   * @throws {RecipeError} When there is no `vercube.config.ts` with a config object
   */
  public addPlugin(plugin: { name: string; from: string; options?: string; imports?: Record<string, string> }): void {
    this.editModule(CONFIG_FILE, (mod) => {
      const config = this.configObject(mod);

      // assigned first and read back: magicast proxies the array on read
      if (config.plugins === undefined) {
        config.plugins = [];
      }

      const plugins = config.plugins as unknown[] & { $type?: string };

      if (plugins.$type !== 'array') {
        throw new RecipeError(
          `the \`plugins\` option of ${CONFIG_FILE} is not an array literal. Add ${plugin.name} from ${plugin.from} to it yourself.`,
        );
      }

      if (plugins.map((entry) => pluginName(entry)).includes(plugin.name)) {
        return false;
      }

      addImport(mod, plugin.name, plugin.from);

      for (const [name, from] of Object.entries(plugin.imports ?? {})) {
        addImport(mod, name, from);
      }

      plugins.push(builders.raw(plugin.options ? `[${plugin.name}, ${plugin.options}]` : plugin.name));

      return true;
    });
  }

  /**
   * Sets a top-level option of `vercube.config.ts`, unless it is set.
   *
   * @param {string} key - The option, such as `health`
   * @param {string} value - Its value, as code
   * @returns {void}
   * @throws {RecipeError} When there is no `vercube.config.ts` with a config object
   */
  public setConfig(key: string, value: string): void {
    this.editModule(CONFIG_FILE, (mod) => {
      const config = this.configObject(mod);

      if (config[key] !== undefined) {
        return false;
      }

      config[key] = builders.raw(value);

      return true;
    });
  }

  /**
   * Binds a class in the container setup, `src/boot/Container.ts`: imports it
   * and adds `container.bind(Class)`. A class already bound is left alone.
   *
   * @param {object} binding - The class
   * @param {string} binding.name - The class name
   * @param {string} binding.from - The module it is imported from, such as `@/jobs/EmailJobs`
   * @param {boolean} [binding.default] - Whether it is the module's default export
   * @returns {void}
   * @throws {RecipeError} When the container setup cannot be found
   */
  public bind(binding: { name: string; from: string; default?: boolean }): void {
    this.editModule(CONTAINER_FILE, (mod) => {
      const setup = findContainerSetup(mod);

      if (!setup) {
        throw new RecipeError(
          `Could not find the container setup in ${CONTAINER_FILE}: a function taking the container. Bind ${binding.name} yourself with container.bind(${binding.name}).`,
        );
      }

      if (setup.body.some((statement: any) => isBindOf(statement, setup.param, binding.name))) {
        return false;
      }

      addImport(mod, binding.name, binding.from, binding.default);
      setup.body.push({ type: 'ExpressionStatement', expression: builders.raw(`${setup.param}.bind(${binding.name})`).$ast });

      return true;
    });
  }

  /**
   * Leaves a one-line note for the summary, such as a command to run.
   *
   * @param {string} note - The note
   * @returns {void}
   */
  public note(note: string): void {
    if (!this.fSummary.notes.includes(note)) {
      this.fSummary.notes.push(note);
    }
  }

  /**
   * Resolves a path of the application, refusing one that leaves it.
   *
   * @param {string} file - Path relative to the application
   * @returns {string} The absolute path
   * @throws {RecipeError} When the path is outside the application
   */
  private appPath(file: string): string {
    const path = join(this.appDir, file);
    const inside = relative(this.appDir, path);

    if (inside.startsWith('..') || isAbsolute(inside)) {
      throw new RecipeError(`${file} is outside the application.`);
    }

    return path;
  }

  /**
   * The config object of `vercube.config.ts`, `defineConfig({ ... })` or a
   * plain default export.
   *
   * @param {Module} mod - The parsed config file
   * @returns {Record<string, any>} The object, proxied by magicast
   * @throws {RecipeError} When the default export is not a config object
   */
  private configObject(mod: Module): Record<string, any> {
    let config: Record<string, any> | undefined;

    try {
      config = getDefaultExportOptions(mod) as Record<string, any>;
    } catch {
      config = undefined;
    }

    if ((config as { $type?: string } | undefined)?.$type !== 'object') {
      throw new RecipeError(`${CONFIG_FILE} must export its config as \`export default defineConfig({ ... })\`.`);
    }

    return config!;
  }

  /**
   * Parses a TypeScript file of the application, lets `edit` change it and
   * writes it back when it reports a change.
   *
   * @param {string} file - Path relative to the application
   * @param {(mod: Module) => boolean} edit - Returns whether it changed something
   * @returns {void}
   * @throws {RecipeError} When the file is missing or does not parse
   */
  private editModule(file: string, edit: (mod: Module) => boolean): void {
    const path = join(this.appDir, file);

    if (!existsSync(path)) {
      throw new RecipeError(`${relative(this.root, path)} not found. The recipe needs it to wire the module in.`);
    }

    let mod: Module;

    try {
      mod = parseModule(readFileSync(path, 'utf8'));
    } catch (error) {
      throw new RecipeError(`${relative(this.root, path)} could not be parsed: ${(error as Error).message}`);
    }

    if (edit(mod)) {
      this.write(path, generateCode(mod).code);
    }
  }

  /**
   * Reads a JSON file, lets `edit` change it and writes it back when it
   * reports a change, two-space indented as package managers write it.
   *
   * @param {string} path - Absolute path
   * @param {(json: Record<string, unknown>) => boolean} edit - Returns whether it changed something
   * @returns {void}
   */
  private editJson(path: string, edit: (json: Record<string, unknown>) => boolean): void {
    const json = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

    if (edit(json)) {
      this.write(path, `${JSON.stringify(json, null, 2)}\n`);
    }
  }

  /**
   * Writes a file and records it for the summary. Unchanged content is not
   * written.
   *
   * @param {string} path - Absolute path
   * @param {string} content - The content
   * @returns {void}
   */
  private write(path: string, content: string): void {
    const exists = existsSync(path);

    if (exists && readFileSync(path, 'utf8') === content) {
      return;
    }

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);

    const file = relative(this.root, path);
    const list = exists ? this.fSummary.updated : this.fSummary.created;

    if (!this.fSummary.created.includes(file) && !list.includes(file)) {
      list.push(file);
    }
  }
}

/**
 * Lists the files of a directory, recursively, relative to it.
 *
 * @param {string} dir - The directory
 * @returns {string[]} The files
 */
export function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)));
}

/**
 * Imports a name into a module, unless it is imported already.
 *
 * @param {Module} mod - The module
 * @param {string} name - The local name
 * @param {string} from - The module it comes from
 * @param {boolean} [isDefault] - Whether it is the default export
 * @returns {void}
 */
function addImport(mod: Module, name: string, from: string, isDefault?: boolean): void {
  const existing = mod.imports[name] as { from?: string; imported?: string } | undefined;

  if (existing) {
    // the same name from another module would bind or register the wrong class
    if (existing.from !== from || (existing.imported === 'default') !== Boolean(isDefault)) {
      throw new RecipeError(
        `${name} is already imported from ${existing.from}, not ${from}. Rename one of them and add it yourself.`,
      );
    }

    return;
  }

  mod.imports.$append({ imported: isDefault ? 'default' : name, local: name, from });
}

/**
 * The class name of a `plugins` entry: `Plugin` or `[Plugin, options]`.
 *
 * @param {unknown} entry - The entry, proxied by magicast
 * @returns {string | undefined} The name
 */
function pluginName(entry: unknown): string | undefined {
  const node = (entry as { $ast?: any })?.$ast ?? entry;
  const target = node?.type === 'ArrayExpression' ? node.elements[0] : node;

  return target?.type === 'Identifier' ? target.name : undefined;
}

/**
 * Finds the function the container is set up in: an exported function whose
 * first parameter is the container, `useContainer` in the starter templates.
 *
 * @param {Module} mod - The parsed file
 * @returns {{ body: any[]; param: string } | null} Its statements and the parameter name
 */
function findContainerSetup(mod: Module): { body: any[]; param: string } | null {
  const exported: any[] = [];
  const local: any[] = [];

  for (const statement of (mod.$ast as any).body) {
    const isExport = statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration';
    const declaration = isExport ? statement.declaration : statement;

    if (declaration?.type === 'FunctionDeclaration') {
      (isExport ? exported : local).push(declaration);
    }
  }

  // the exported setup is the one the entry calls; a local helper only when nothing is exported
  const candidates = exported.length > 0 ? exported : local;

  const setup =
    candidates.find((fn) => fn.id?.name === 'useContainer') ??
    candidates.find((fn) => fn.params[0]?.typeAnnotation?.typeAnnotation?.typeName?.name === 'Container');
  const param = setup?.params[0]?.name;

  return setup && param ? { body: setup.body.body, param } : null;
}

/**
 * Whether a statement is `container.bind(Name)`.
 *
 * @param {any} statement - The statement
 * @param {string} param - The container parameter name
 * @param {string} name - The class name
 * @returns {boolean} True when it binds the class
 */
function isBindOf(statement: any, param: string, name: string): boolean {
  const call = statement?.type === 'ExpressionStatement' ? statement.expression : null;

  return (
    call?.type === 'CallExpression' &&
    call.callee?.type === 'MemberExpression' &&
    call.callee.object?.name === param &&
    call.callee.property?.name === 'bind' &&
    call.arguments[0]?.type === 'Identifier' &&
    call.arguments[0].name === name
  );
}

/**
 * What goes between the content of a file and a block appended to it: a blank
 * line, unless the file is empty or already ends in one.
 *
 * @param {string} current - The content
 * @returns {string} The separator
 */
function separatorAfter(current: string): string {
  if (current === '' || current.endsWith('\n\n')) {
    return '';
  }

  return current.endsWith('\n') ? '\n' : '\n\n';
}

/**
 * Sorts an object by key, as package managers keep dependency lists.
 *
 * @param {Record<string, string>} object - The object
 * @returns {Record<string, string>} A sorted copy
 */
function sortKeys(object: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(object).toSorted(([a], [b]) => a.localeCompare(b)));
}
