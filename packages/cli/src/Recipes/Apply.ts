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

  // an answer no prompt offers would make a recipe write a setup nobody tested
  for (const recipe of catalog.filter((candidate) => answers[candidate.id])) {
    for (const prompt of recipe.prompts ?? []) {
      const value = resolvedAnswers[recipe.id][prompt.name];

      if (prompt.options.length > 0 && !prompt.options.some((option) => option.value === value)) {
        throw new RecipeError(
          `--${prompt.flag} must be one of ${prompt.options.map((option) => option.value).join(', ')}, got ${value}.`,
        );
      }
    }
  }

  const { recipes, implied } = resolveRecipes(selected, catalog, resolvedAnswers);
  const ids = new Set(recipes.map((recipe) => recipe.id));

  for (const recipe of recipes) {
    const reason = recipe.unsupported?.(project);

    if (reason) {
      throw new RecipeError(`${recipe.label} cannot be added to this project: ${reason}`);
    }
  }

  // a project applied to before reports only what this call changed
  const before = project.summary;

  for (const recipe of recipes) {
    try {
      await recipe.apply({ project, answers: resolvedAnswers[recipe.id], selected: ids, version: project.version });
    } catch (error) {
      // all or nothing: a module half wired in is worse than none
      project.rollback();

      if (error instanceof RecipeError) {
        throw new RecipeError(`${recipe.label}: ${error.message}`);
      }

      throw error;
    }
  }

  const after = project.summary;
  const since = <T>(list: T[], earlier: T[]): T[] => list.slice(earlier.length);

  return {
    applied: recipes.map((recipe) => recipe.id),
    implied,
    created: since(after.created, before.created),
    updated: after.updated.filter((file) => !before.updated.includes(file)),
    dependencies: since(after.dependencies, before.dependencies),
    services: since(after.services, before.services),
    notes: since(after.notes, before.notes),
    builds: since(after.builds, before.builds),
  };
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
