import { RecipeError } from '../Recipes/RecipeError';
import type { RecipeTypes } from '../Recipes/RecipeTypes';
import type { Template } from './Templates';

/** Modules selected in the prompt until the user changes them. */
export const DEFAULT_MODULES: readonly string[] = ['schema', 'testing', 'devtools'];

/** The deploy target that needs no recipe: `vercube build` and a Node, Bun or Deno server. */
export const DEFAULT_DEPLOY = 'node';

/** Package managers a project can be created with. */
export const PACKAGE_MANAGERS: readonly string[] = ['pnpm', 'npm', 'yarn', 'bun', 'deno'];

/**
 * What the command line gave `vercube init`.
 */
export interface InitInput {
  /** The project directory argument. */
  dir?: string;

  /** `--template`. */
  template?: string;

  /** `--modules`, comma separated; `none` for no modules. */
  modules?: string;

  /** `--deploy`. */
  deploy?: string;

  /** `--package-manager`. */
  packageManager?: string;

  /** Recipe prompt flags by flag name, such as `{ queue: 'rabbitmq' }`. */
  flags: Record<string, string | undefined>;

  /** `--yes`: take the default for every question not answered by a flag. */
  yes: boolean;

  /** Whether questions can be asked. */
  interactive: boolean;
}

/**
 * Everything `vercube init` needs to create a project.
 */
export interface InitPlan {
  dir: string;
  template: Template;
  modules: string[];
  deploy: string;
  packageManager: string;
  /** Answers per recipe id. */
  answers: Record<string, Record<string, string>>;
}

/** One choice of a question. */
export interface Choice {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Asks questions in a terminal. Injected, so the plan can be resolved in tests
 * and without a TTY.
 */
export interface Prompter {
  text(message: string, defaultValue: string): Promise<string>;
  select(message: string, choices: Choice[], initial: string): Promise<string>;
  multiselect(message: string, choices: Choice[], initial: string[]): Promise<string[]>;
}

/**
 * Resolves every answer `vercube init` needs: from flags first, then from the
 * user, or from the defaults with `--yes`. Without a terminal and without
 * `--yes`, a missing answer fails with the flags that would give it, rather
 * than waiting for input that never comes.
 *
 * @param {InitInput} input - The command line
 * @param {object} catalogs - What can be chosen
 * @param {readonly Template[]} catalogs.templates - The base templates
 * @param {RecipeTypes.Recipe[]} catalogs.recipes - Every recipe, modules and deploy targets
 * @param {Prompter} prompter - Asks the questions flags did not answer
 * @param {string} [detectedPackageManager] - The package manager running the CLI
 * @returns {Promise<InitPlan>} The plan
 * @throws {RecipeError} On an unknown template, module, deploy target or answer, or missing answers without a terminal
 */
export async function resolveInitPlan(
  input: InitInput,
  catalogs: { templates: readonly Template[]; recipes: RecipeTypes.Recipe<any>[] },
  prompter: Prompter,
  detectedPackageManager: string = 'pnpm',
): Promise<InitPlan> {
  const modules = catalogs.recipes.filter((recipe) => recipe.kind !== 'deploy');
  const deploys = catalogs.recipes.filter((recipe) => recipe.kind === 'deploy');
  const missing: string[] = [];
  const ask = !input.yes && input.interactive;

  // Without a terminal every question is answered by a flag or a default, so
  // the missing ones are collected and reported together instead of one by one.
  const answer = async <T>(given: T | undefined, flag: string, fallback: T, question: () => Promise<T>): Promise<T> => {
    if (given !== undefined) {
      return given;
    }

    if (ask) {
      return question();
    }

    if (!input.yes) {
      missing.push(flag);
    }

    return fallback;
  };

  const dir = await answer(input.dir || undefined, '<dir>', 'vercube-app', () =>
    prompter.text('Where would you like to create your project?', 'vercube-app'),
  );

  const templateId = await answer(input.template, '--template', catalogs.templates[0].id, () =>
    prompter.select(
      'What are you building?',
      catalogs.templates.map((template) => ({ value: template.id, label: template.label })),
      catalogs.templates[0].id,
    ),
  );

  const template = catalogs.templates.find((candidate) => candidate.id === templateId);

  if (!template) {
    throw new RecipeError(`Unknown template "${templateId}". Available: ${catalogs.templates.map((t) => t.id).join(', ')}.`);
  }

  const selected = await answer(
    input.modules === undefined ? undefined : parseList(input.modules),
    '--modules',
    DEFAULT_MODULES.filter((id) => modules.some((recipe) => recipe.id === id)),
    () =>
      prompter.multiselect(
        'Which modules do you want?',
        modules.map((recipe) => ({ value: recipe.id, label: recipe.label, hint: recipe.hint })),
        DEFAULT_MODULES.filter((id) => modules.some((recipe) => recipe.id === id)),
      ),
  );

  const unknown = selected.filter((id) => !modules.some((recipe) => recipe.id === id));

  if (unknown.length > 0) {
    throw new RecipeError(
      `Unknown module${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Available: ${modules.map((r) => r.id).join(', ')}.`,
    );
  }

  const answers: Record<string, Record<string, string>> = {};

  for (const recipe of modules.filter((candidate) => selected.includes(candidate.id))) {
    answers[recipe.id] = await answerPrompts(recipe, input, answer, prompter);
  }

  const deploy = await answer(input.deploy, '--deploy', DEFAULT_DEPLOY, () =>
    prompter.select(
      'Deploy target?',
      [
        { value: DEFAULT_DEPLOY, label: 'Node, Bun or Deno server' },
        ...deploys.map((recipe) => ({ value: recipe.id, label: recipe.label })),
      ],
      DEFAULT_DEPLOY,
    ),
  );

  if (deploy !== DEFAULT_DEPLOY && !deploys.some((recipe) => recipe.id === deploy)) {
    throw new RecipeError(
      `Unknown deploy target "${deploy}". Available: ${[DEFAULT_DEPLOY, ...deploys.map((r) => r.id)].join(', ')}.`,
    );
  }

  const deployRecipe = deploys.find((recipe) => recipe.id === deploy);

  if (deployRecipe) {
    answers[deployRecipe.id] = await answerPrompts(deployRecipe, input, answer, prompter);
  }

  const packageManager = await answer(
    input.packageManager,
    '--package-manager',
    PACKAGE_MANAGERS.includes(detectedPackageManager) ? detectedPackageManager : 'pnpm',
    () =>
      prompter.select(
        'Package manager?',
        PACKAGE_MANAGERS.map((name) => ({ value: name, label: name })),
        PACKAGE_MANAGERS.includes(detectedPackageManager) ? detectedPackageManager : 'pnpm',
      ),
  );

  if (missing.length > 0) {
    throw new RecipeError(
      `Missing ${missing.join(', ')}. Pass them, or --yes for the defaults, when there is no terminal to ask in. Example: vercube init my-app --template api --modules schema,testing --deploy node --yes`,
    );
  }

  if (!PACKAGE_MANAGERS.includes(packageManager)) {
    throw new RecipeError(`Unknown package manager "${packageManager}". Available: ${PACKAGE_MANAGERS.join(', ')}.`);
  }

  if (packageManager === 'deno' && template.id !== 'api') {
    throw new RecipeError(`Deno supports the api template only, got ${template.id}.`);
  }

  return {
    dir,
    template,
    modules: selected,
    deploy,
    packageManager,
    answers,
  };
}

/**
 * Answers the questions of one recipe: each from its flag, the user, or its default.
 *
 * @param {RecipeTypes.Recipe} recipe - The recipe
 * @param {InitInput} input - The command line
 * @param {Function} answer - Resolves one answer
 * @param {Prompter} prompter - Asks the question
 * @returns {Promise<Record<string, string>>} The answers by prompt name
 * @throws {RecipeError} On an answer that is not one of the choices
 */
async function answerPrompts(
  recipe: RecipeTypes.Recipe<any>,
  input: InitInput,
  answer: <T>(given: T | undefined, flag: string, fallback: T, question: () => Promise<T>) => Promise<T>,
  prompter: Prompter,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  for (const prompt of recipe.prompts ?? []) {
    const value = await answer(input.flags[prompt.flag], `--${prompt.flag}`, prompt.default, () =>
      prompter.select(prompt.message, prompt.options, prompt.default),
    );

    if (!prompt.options.some((option) => option.value === value)) {
      throw new RecipeError(
        `--${prompt.flag} must be one of ${prompt.options.map((option) => option.value).join(', ')}, got ${value}.`,
      );
    }

    result[prompt.name] = value;
  }

  return result;
}

/**
 * Splits a comma-separated list, `none` being the empty one.
 *
 * @param {string} value - The flag value
 * @returns {string[]} The items
 */
export function parseList(value: string): string[] {
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length === 1 && items[0] === 'none' ? [] : [...new Set(items)];
}
