import { consola } from 'consola';
import { colors } from 'consola/utils';
import { Flag } from '../Decorators/Flag';
import { RECIPES } from '../Recipes/Catalog';
import type { RecipeTypes } from '../Recipes/RecipeTypes';
import type { Choice, Prompter } from './Plan';

/** The logger the scaffolding commands write through. */
export const logger = consola.withTag(colors.whiteBright(colors.bold(colors.bgGreenBright(' vercube '))));

/** The questions of the built-in recipes, one per flag (`--queue`, `--scheduler-store`, ...). */
export const RECIPE_PROMPTS: RecipeTypes.Prompt[] = [
  ...new Map(RECIPES.flatMap((recipe) => recipe.prompts ?? []).map((prompt) => [prompt.flag, prompt])).values(),
];

/**
 * The property a recipe flag is stored under on a command.
 *
 * @param {string} flag - The flag name
 * @returns {string} The property
 */
export function recipeFlagProperty(flag: string): string {
  return `recipe:${flag}`;
}

/**
 * Adds one string flag per recipe question to a command.
 *
 * @param {object} prototype - The command's prototype
 * @returns {void}
 */
export function addRecipeFlags(prototype: object): void {
  for (const prompt of RECIPE_PROMPTS) {
    Flag({
      name: prompt.flag,
      description: `${prompt.message.replace(/\?$/, '')} (${prompt.options.map((option) => option.value).join(', ')})`,
      type: 'string',
    })(prototype, recipeFlagProperty(prompt.flag));
  }
}

/**
 * Reads the recipe flags a command was given.
 *
 * @param {object} command - The command
 * @returns {Record<string, string | undefined>} Flag name to value
 */
export function readRecipeFlags(command: object): Record<string, string | undefined> {
  return Object.fromEntries(
    RECIPE_PROMPTS.map((prompt) => [
      prompt.flag,
      (command as Record<string, string | undefined>)[recipeFlagProperty(prompt.flag)],
    ]),
  );
}

/** Asks the questions in the terminal, through consola. */
export const prompter: Prompter = {
  text: (message, defaultValue) =>
    logger.prompt(message, {
      type: 'text',
      placeholder: defaultValue,
      default: defaultValue,
      cancel: 'reject',
    }) as Promise<string>,
  select: async (message, choices, initial) =>
    value(await logger.prompt(message, { type: 'select', options: choices, initial, cancel: 'reject' })),
  multiselect: async (message, choices, initial) =>
    (
      (await logger.prompt(message, { type: 'multiselect', options: choices, initial, required: false, cancel: 'reject' })) as (
        | Choice
        | string
      )[]
    ).map((choice) => value(choice)),
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
