import { RecipeError } from './RecipeError';
import { resolveRecipes } from './Resolve';
import type { Project } from './Project';
import type { RecipeTypes } from './RecipeTypes';

/**
 * Resolves the selected recipes and applies them to a project, in order.
 *
 * @param {Project} project - The project
 * @param {string[]} selected - Ids picked by the user
 * @param {RecipeTypes.Recipe[]} catalog - Every known recipe
 * @param {Record<string, Record<string, string>>} [answers] - Answers per recipe id; missing ones take the prompt default
 * @returns {Promise<RecipeTypes.Summary>} What was applied and changed
 * @throws {RecipeError} When a recipe cannot be resolved, does not fit the project, or fails
 */
export async function applyRecipes(
  project: Project,
  selected: string[],
  catalog: RecipeTypes.Recipe<any>[],
  answers: Record<string, Record<string, string>> = {},
): Promise<RecipeTypes.Summary> {
  const withDefaults = (recipe: RecipeTypes.Recipe<any>): Record<string, string> => ({
    ...Object.fromEntries((recipe.prompts ?? []).map((prompt) => [prompt.name, prompt.default])),
    ...answers[recipe.id],
  });

  const resolvedAnswers = Object.fromEntries(catalog.map((recipe) => [recipe.id, withDefaults(recipe)]));
  const { recipes, implied } = resolveRecipes(selected, catalog, resolvedAnswers);
  const ids = new Set(recipes.map((recipe) => recipe.id));

  for (const recipe of recipes) {
    const reason = recipe.unsupported?.(project);

    if (reason) {
      throw new RecipeError(`${recipe.label} cannot be added to this project: ${reason}`);
    }
  }

  for (const recipe of recipes) {
    try {
      await recipe.apply({ project, answers: resolvedAnswers[recipe.id], selected: ids, version: project.version });
    } catch (error) {
      if (error instanceof RecipeError) {
        throw new RecipeError(`${recipe.label}: ${error.message}`);
      }

      throw error;
    }
  }

  return { applied: recipes.map((recipe) => recipe.id), implied, ...project.summary };
}

/**
 * Declares a recipe, typed by its answers. An identity function, for type
 * inference in a module's `recipe` export.
 *
 * @param {RecipeTypes.Recipe<Answers>} recipe - The recipe
 * @returns {RecipeTypes.Recipe<Answers>} The same recipe
 */
export function defineRecipe<Answers extends Record<string, string> = Record<string, string>>(
  recipe: RecipeTypes.Recipe<Answers>,
): RecipeTypes.Recipe<Answers> {
  return recipe;
}
