import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseYAML, stringifyYAML } from 'confbox/yaml';
import { builders, generateCode, parseModule } from 'magicast';
import { getDefaultExportOptions } from 'magicast/helpers';
import { dirname, join, relative } from 'pathe';
import { RecipeError } from './RecipeError';
import type { RecipeTypes } from './RecipeTypes';

/** A module parsed by magicast. */
type Module = ReturnType<typeof parseModule>;

/** The file a Vercube app is configured in. */
const CONFIG_FILE = 'vercube.config.ts';

/** Where the starter templates set up the container. */
const CONTAINER_FILE = 'src/boot/Container.ts';

/** The entry the starter templates build and run. */
const ENTRY_FILE = 'src/index.ts';

/** A name a statement needs imported: the module, whether it is its default export, whether it is a type. */
export type ImportSpec = string | { from: string; default?: boolean; type?: boolean };

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
    builds: [],
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
  }

  /**
   * The layout of the project: a single API, or a workspace with `apps/api`
   * and `apps/web`.
   */
  public get layout(): 'api' | 'fullstack' {
    return this.appDir === this.root ? 'api' : 'fullstack';
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
      builds: [...this.fSummary.builds],
    };
  }

  /**
   * Whether a file of the application exists.
   *
   * @param {string} file - Path relative to the application
   * @returns {boolean} True when it exists
   */
  public exists(file: string): boolean {
    return existsSync(join(this.appDir, file));
  }

  /**
   * Reads a file of the application.
   *
   * @param {string} file - Path relative to the application
   * @returns {string | null} Its content, null when it does not exist
   */
  public read(file: string): string | null {
    const path = join(this.appDir, file);

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
    const path = join(this.appDir, file);

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
    const field = options.dev ? 'devDependencies' : 'dependencies';

    this.editJson(join(this.appDir, 'package.json'), (pkg) => {
      const existing = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) } as Record<string, string>;
      const target = { ...(pkg[field] as Record<string, string> | undefined) };
      let changed = false;

      for (const [name, range] of Object.entries(dependencies)) {
        if (existing[name] !== undefined) {
          continue;
        }

        target[name] = name.startsWith('@vercube/') ? this.version : range;
        this.fSummary.dependencies.push(name);
        changed = true;
      }

      if (changed) {
        pkg[field] = Object.fromEntries(Object.entries(target).toSorted(([a], [b]) => a.localeCompare(b)));
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
   * @returns {void}
   */
  public addEnv(variables: Record<string, string>, comment?: string): void {
    for (const file of ['.env.example', '.env']) {
      const path = join(this.appDir, file);
      const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
      const present = new Set(
        current
          .split('\n')
          .map((line) => /^\s*(?:export\s+)?([\w.]+)\s*=/.exec(line)?.[1])
          .filter(Boolean),
      );
      const missing = Object.entries(variables).filter(([name]) => !present.has(name));

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
    const yaml = stringifyYAML(document, { indent: 2 });

    this.write(path, yaml.endsWith('\n') ? yaml : `${yaml}\n`);
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
   * @param {Record<string, ImportSpec>} [plugin.imports] - Other names the options use, name to module
   * @returns {void}
   * @throws {RecipeError} When there is no `vercube.config.ts` with a config object
   */
  public addPlugin(plugin: { name: string; from: string; options?: string; imports?: Record<string, ImportSpec> }): void {
    this.editModule(CONFIG_FILE, (mod) => {
      const config = this.configObject(mod);

      // assigned first and read back: magicast proxies the array on read
      if (config.plugins === undefined) {
        config.plugins = [];
      }

      const plugins = config.plugins as unknown[];

      if (plugins.map((entry) => pluginName(entry)).includes(plugin.name)) {
        return false;
      }

      addImport(mod, plugin.name, plugin.from);
      addImports(mod, plugin.imports);

      // `withPluginOptions` type-checks the options against the plugin, a
      // `[Plugin, options]` tuple would take anything
      if (plugin.options) {
        addImport(mod, 'withPluginOptions', '@vercube/core');
      }

      plugins.push(builders.raw(plugin.options ? `withPluginOptions(${plugin.name}, ${plugin.options})` : plugin.name));

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
   * Adds a statement to the end of the container setup in
   * `src/boot/Container.ts`, such as mounting a storage. A statement that is
   * there already, ignoring whitespace, is not added again.
   *
   * @param {string} code - The statement; `container` is the setup's container parameter
   * @param {Record<string, ImportSpec>} [imports] - Names it uses, name to module
   * @returns {void}
   * @throws {RecipeError} When the container setup cannot be found
   */
  public addToContainer(code: string, imports?: Record<string, ImportSpec>): void {
    this.editModule(CONTAINER_FILE, (mod) => {
      const setup = findContainerSetup(mod);

      if (!setup) {
        throw new RecipeError(
          `Could not find the container setup in ${CONTAINER_FILE}: a function taking the container. Add this to it yourself: ${code}`,
        );
      }

      const statement = code.replaceAll(/\bcontainer\b/g, setup.param);

      if (hasStatement(setup.body, statement)) {
        return false;
      }

      addImports(mod, imports);
      setup.body.push(...parseStatements(statement));

      return true;
    });
  }

  /**
   * Adds a statement to the entry, `src/index.ts`: right before the
   * `createApp()` call, or at the end. A statement that is there already,
   * ignoring whitespace, is not added again.
   *
   * @param {string} code - The statement
   * @param {object} [options] - Where and what it needs
   * @param {'before-create-app' | 'end'} [options.position] - Where it goes, the end by default
   * @param {Record<string, ImportSpec>} [options.imports] - Names it uses, name to module
   * @returns {void}
   * @throws {RecipeError} When the entry or its `createApp()` call cannot be found
   */
  public addToEntry(
    code: string,
    options: { position?: 'before-create-app' | 'end'; imports?: Record<string, ImportSpec> } = {},
  ): void {
    this.editModule(ENTRY_FILE, (mod) => {
      const body = (mod.$ast as any).body as any[];

      if (hasStatement(body, code)) {
        return false;
      }

      const statements = parseStatements(code);

      if (options.position === 'before-create-app') {
        const index = body.findIndex((statement) => generate(statement).includes('createApp('));

        if (index === -1) {
          throw new RecipeError(`Could not find the createApp() call in ${ENTRY_FILE}. Add this before it yourself: ${code}`);
        }

        body.splice(index, 0, ...statements);
      } else {
        body.push(...statements);
      }

      addImports(mod, options.imports);

      return true;
    });
  }

  /**
   * Edits a JSON file of the application, such as tsconfig.json. Written back
   * only when `edit` reports a change. Comments are not kept.
   *
   * @param {string} file - Path relative to the application
   * @param {(json: Record<string, any>) => boolean} edit - Returns whether it changed something
   * @returns {void}
   * @throws {RecipeError} When the file is missing or is not plain JSON
   */
  public updateJson(file: string, edit: (json: Record<string, any>) => boolean): void {
    const path = join(this.appDir, file);

    if (!existsSync(path)) {
      throw new RecipeError(`${relative(this.root, path)} not found.`);
    }

    try {
      this.editJson(path, edit);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new RecipeError(`${relative(this.root, path)} is not plain JSON (comments?), edit it yourself.`);
      }

      throw error;
    }
  }

  /**
   * Appends lines to a text file of the application, such as `.gitignore`,
   * leaving out the ones it has. The file is created when missing.
   *
   * @param {string} file - Path relative to the application
   * @param {string[]} lines - The lines
   * @returns {void}
   */
  public addLines(file: string, lines: string[]): void {
    const path = join(this.appDir, file);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const present = new Set(current.split('\n').map((line) => line.trim()));
    const missing = lines.filter((line) => !present.has(line.trim()));

    if (missing.length > 0) {
      this.write(path, `${current}${separatorAfter(current)}${missing.join('\n')}\n`);
    }
  }

  /**
   * Allows packages a recipe adds to run their install scripts. pnpm refuses to
   * install a package with an unapproved build script; the CLI writes the
   * approvals to pnpm-workspace.yaml when the project uses pnpm.
   *
   * @param {string[]} packages - Package names
   * @returns {void}
   */
  public allowBuilds(packages: string[]): void {
    for (const name of packages) {
      if (!this.fSummary.builds.includes(name)) {
        this.fSummary.builds.push(name);
      }
    }
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
function addImport(mod: Module, name: string, from: string, isDefault?: boolean, isType?: boolean): void {
  if (mod.imports[name]) {
    return;
  }

  if (!isType) {
    mod.imports.$append({ imported: isDefault ? 'default' : name, local: name, from });

    return;
  }

  // \`import type\`, which magicast cannot write: \`verbatimModuleSyntax\` needs it
  // for a type, and a value import of a type-only export fails at runtime
  const body = (mod.$ast as any).body as any[];
  const last = body.findLastIndex((statement) => statement.type === 'ImportDeclaration');
  const statement = isDefault ? `import type ${name} from '${from}';` : `import type { ${name} } from '${from}';`;

  body.splice(last + 1, 0, ...parseStatements(statement));
}

/**
 * Imports names into a module, unless they are imported already.
 *
 * @param {Module} mod - The module
 * @param {Record<string, ImportSpec>} [imports] - Name to module
 * @returns {void}
 */
function addImports(mod: Module, imports?: Record<string, ImportSpec>): void {
  for (const [name, spec] of Object.entries(imports ?? {})) {
    const {
      from,
      default: isDefault,
      type: isType,
    } = typeof spec === 'string' ? { from: spec, default: false, type: false } : spec;

    addImport(mod, name, from, isDefault, isType);
  }
}

/**
 * Parses statements to AST nodes.
 *
 * @param {string} code - The statements
 * @returns {any[]} The nodes
 */
function parseStatements(code: string): any[] {
  return (parseModule(code).$ast as any).body;
}

/**
 * Prints an AST node.
 *
 * @param {any} node - The node
 * @returns {string} Its code
 */
function generate(node: any): string {
  const mod = parseModule('');

  (mod.$ast as any).body.push(node);

  return generateCode(mod).code;
}

/**
 * Whether a list of statements holds the given code, ignoring whitespace and
 * trailing commas.
 *
 * @param {any[]} body - The statements
 * @param {string} code - The code to look for
 * @returns {boolean} True when it is there
 */
function hasStatement(body: any[], code: string): boolean {
  const normalize = (text: string): string =>
    text
      .replaceAll(/\s+/g, '')
      .replaceAll(/,([)\]}])/g, '$1')
      .replace(/;$/, '');
  const wanted = parseStatements(code).map((statement) => normalize(generate(statement)));
  const present = new Set(body.map((statement) => normalize(generate(statement))));

  return wanted.every((statement) => present.has(statement));
}

/**
 * The class name of a `plugins` entry: `Plugin`, `[Plugin, options]` or
 * `withPluginOptions(Plugin, options)`.
 *
 * @param {unknown} entry - The entry, proxied by magicast
 * @returns {string | undefined} The name
 */
function pluginName(entry: unknown): string | undefined {
  const node = (entry as { $ast?: any })?.$ast ?? entry;
  let target = node;

  if (node?.type === 'ArrayExpression') {
    target = node.elements[0];
  } else if (node?.type === 'CallExpression') {
    target = node.arguments[0];
  }

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
  const candidates: any[] = [];

  for (const statement of (mod.$ast as any).body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
        ? statement.declaration
        : statement;

    if (declaration?.type === 'FunctionDeclaration') {
      candidates.push(declaration);
    }
  }

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
