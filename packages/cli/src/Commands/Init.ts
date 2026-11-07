import { existsSync, readdirSync } from 'node:fs';
import { consola } from 'consola';
import { colors } from 'consola/utils';
import { startShell } from 'giget';
import { relative, resolve } from 'pathe';
import { hasTTY, isCI } from 'std-env';
import { version } from '../../package.json';
import { BaseCommand } from '../BaseCommand';
import { Arg } from '../Decorators/Arg';
import { Command } from '../Decorators/Command';
import { Flag } from '../Decorators/Flag';
import { RECIPES } from '../Recipes/Catalog';
import { RecipeError } from '../Recipes/RecipeError';
import { resolveInitPlan } from '../Scaffold/Plan';
import { formatSummary, scaffoldProject } from '../Scaffold/Scaffold';
import { TEMPLATES } from '../Scaffold/Templates';
import { vercubeIcon } from '../Utils/Logo';
import type { Choice, Prompter } from '../Scaffold/Plan';

/* eslint-disable unicorn/no-process-exit */

const logger = consola.withTag(colors.whiteBright(colors.bold(colors.bgGreenBright(' vercube '))));

/** The flags of recipe questions, such as `--queue`, added below the class. */
const RECIPE_FLAGS = [...new Map(RECIPES.flatMap((recipe) => recipe.prompts ?? []).map((prompt) => [prompt.flag, prompt])).values()];

/**
 * Scaffolds a new Vercube project: a base template, the chosen modules wired
 * in by their recipes, and a deploy target. Asks for what the flags do not
 * answer when there is a terminal; without one, missing answers fail with the
 * flags to pass, or take the defaults with `--yes`.
 *
 * @example
 * ```sh
 * vercube init my-app
 * vercube init my-app --template fullstack-vue --modules schema,queue,testing --queue bullmq --deploy node --yes
 * ```
 */
@Command({
  name: 'init',
  description: 'Initialize a new Vercube app',
})
export class InitCommand extends BaseCommand {
  /** Target directory. Prompted interactively when omitted. */
  @Arg({ name: 'dir', description: 'Project directory', required: false })
  public dir!: string;

  /** The base template. */
  @Flag({ name: 'template', description: `Template (${TEMPLATES.map((t) => t.id).join(', ')})`, type: 'string' })
  public template!: string;

  /** The modules, comma separated. */
  @Flag({
    name: 'modules',
    description: `Modules, comma separated, or none (${RECIPES.filter((r) => r.kind !== 'deploy')
      .map((r) => r.id)
      .join(', ')})`,
    type: 'string',
  })
  public modules!: string;

  /** The deploy target. */
  @Flag({
    name: 'deploy',
    description: `Deploy target (node, ${RECIPES.filter((r) => r.kind === 'deploy')
      .map((r) => r.id)
      .join(', ')})`,
    type: 'string',
  })
  public deploy!: string;

  /** Take the default for every question no flag answers. */
  @Flag({ name: 'yes', description: 'Use the defaults for everything not passed as a flag', default: false })
  public yes!: boolean;

  /** Overwrite existing directory without prompting. */
  @Flag({ name: 'force', description: 'Override existing directory', default: false })
  public force!: boolean;

  /** Set to `false` to skip dependency installation. */
  @Flag({ name: 'install', description: 'Install dependencies', default: true })
  public install!: boolean;

  /** Run `git init` in the new project directory. */
  @Flag({ name: 'gitInit', description: 'Initialize git repository', default: true })
  public gitInit!: boolean;

  /** Package manager for dependency installation. */
  @Flag({ name: 'packageManager', description: 'Package manager (pnpm, npm, yarn, bun, deno)', type: 'string' })
  public packageManager!: string;

  /** Copy the template from a local directory instead of downloading it, for tests and CI. */
  @Flag({ name: 'templateDir', description: 'Use a local template directory instead of downloading one', type: 'string' })
  public templateDir!: string;

  /** Open an interactive shell in the project directory after scaffolding. */
  @Flag({ name: 'shell', description: 'Open shell in project directory', default: false })
  public shell!: boolean;

  /**
   * @returns resolves when scaffolding and setup are complete
   */
  public override async run(): Promise<void> {
    const interactive = hasTTY && !isCI;

    if (interactive) {
      process.stdout.write(`\n${vercubeIcon}\n\n`);
      consola.info(`Welcome to ${colors.bold('Vercube')}!`);
    }

    try {
      const plan = await resolveInitPlan(
        {
          dir: this.dir,
          template: this.template,
          modules: this.modules,
          deploy: this.deploy,
          packageManager: this.packageManager,
          flags: Object.fromEntries(RECIPE_FLAGS.map((prompt) => [prompt.flag, (this as any)[recipeFlagProperty(prompt.flag)]])),
          yes: this.yes,
          interactive,
        },
        { templates: TEMPLATES, recipes: RECIPES },
        prompter,
        detectPackageManager(),
      );

      const cwd = resolve(process.cwd());
      const dir = resolve(cwd, plan.dir);
      const force = this.force || (await this.confirmOverwrite(dir, interactive));

      logger.start(`Creating ${colors.cyan(relative(cwd, dir) || '.')}...`);

      const summary = await scaffoldProject(plan, {
        dir,
        version,
        recipes: RECIPES,
        force,
        templateDir: this.templateDir ? resolve(cwd, this.templateDir) : undefined,
        install: this.install,
        gitInit: this.gitInit,
        log: (message) => logger.info(message),
      });

      logger.success(formatSummary(plan, summary, relative(cwd, dir) || '.').join('\n  '));

      if (this.shell) {
        startShell(dir);
      }
    } catch (error) {
      if (error instanceof RecipeError || (error as Error)?.message === 'cancelled') {
        logger.error((error as Error).message);
        process.exit(1);
      }

      if (process.env.DEBUG) {
        throw error;
      }

      logger.error(String(error));
      process.exit(1);
    }
  }

  /**
   * Whether an existing, non-empty directory may be overwritten: asked in a
   * terminal, refused without one unless `--force` is set.
   *
   * @param {string} dir - The directory
   * @param {boolean} interactive - Whether there is a terminal
   * @returns {Promise<boolean>} True when it may be overwritten
   * @throws {RecipeError} When it may not
   */
  private async confirmOverwrite(dir: string, interactive: boolean): Promise<boolean> {
    if (!existsSync(dir) || readdirSync(dir).length === 0) {
      return false;
    }

    if (!interactive) {
      throw new RecipeError(`${dir} is not empty. Pass --force to overwrite it.`);
    }

    const overwrite = await logger.prompt(`${colors.cyan(dir)} is not empty. Overwrite its contents?`, {
      type: 'confirm',
      initial: false,
      cancel: 'reject',
    });

    if (!overwrite) {
      throw new RecipeError('Aborted.');
    }

    return true;
  }
}

/**
 * The property a recipe flag is stored under on the command.
 *
 * @param {string} flag - The flag name
 * @returns {string} The property
 */
function recipeFlagProperty(flag: string): string {
  return `recipe:${flag}`;
}

// one string flag per recipe question, `--queue`, `--scheduler-store` and so on
for (const prompt of RECIPE_FLAGS) {
  Flag({
    name: prompt.flag,
    description: `${prompt.message.replace(/\?$/, '')} (${prompt.options.map((option) => option.value).join(', ')})`,
    type: 'string',
  })(InitCommand.prototype, recipeFlagProperty(prompt.flag));
}

/**
 * The package manager running the CLI, from the user agent it sets.
 *
 * @returns {string} Its name, `pnpm` when unknown
 */
function detectPackageManager(): string {
  return process.env.npm_config_user_agent?.split('/')[0] || 'pnpm';
}

/** Asks the questions in the terminal, through consola. */
const prompter: Prompter = {
  text: (message, defaultValue) =>
    logger.prompt(message, { type: 'text', placeholder: defaultValue, default: defaultValue, cancel: 'reject' }) as Promise<string>,
  select: async (message, choices, initial) =>
    value(await logger.prompt(message, { type: 'select', options: choices, initial, cancel: 'reject' })),
  multiselect: async (message, choices, initial) =>
    ((await logger.prompt(message, { type: 'multiselect', options: choices, initial, required: false, cancel: 'reject' })) as (
      | Choice
      | string
    )[]).map((choice) => value(choice)),
};

/**
 * The value of an answer, which consola returns as the option or its value.
 *
 * @param {Choice | string} choice - The answer
 * @returns {string} The value
 */
function value(choice: Choice | string): string {
  return typeof choice === 'string' ? choice : choice.value;
}
