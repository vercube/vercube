import { RecipeError } from './RecipeError';
import type { RecipeTypes } from './RecipeTypes';

/**
 * Turns the selected recipe ids into the recipes to apply, in order: every
 * recipe a selected one requires is added, a recipe comes after the ones it
 * requires or is `after`, and deploy targets come last.
 *
 * @param {string[]} selected - Ids picked by the user
 * @param {RecipeTypes.Recipe[]} catalog - Every known recipe
 * @param {Record<string, Record<string, string>>} [answers] - Answers per recipe, which `requires` may depend on
 * @returns {{ recipes: RecipeTypes.Recipe[]; implied: string[] }} The recipes in order, and the ids added automatically
 * @throws {RecipeError} On an unknown id, a cycle, or more than one deploy target
 */
export function resolveRecipes(
  selected: string[],
  catalog: RecipeTypes.Recipe<any>[],
  answers: Record<string, Record<string, string>> = {},
): { recipes: RecipeTypes.Recipe<any>[]; implied: string[] } {
  const byId = new Map(catalog.map((recipe) => [recipe.id, recipe]));
  const duplicates = catalog.filter((recipe, index) => catalog.findIndex((other) => other.id === recipe.id) !== index);

  if (duplicates.length > 0) {
    throw new RecipeError(`Two recipes share the id ${[...new Set(duplicates.map((recipe) => recipe.id))].join(', ')}.`);
  }

  // asked once per recipe, so both passes below see the same answer
  const required = new Map<string, string[]>();
  const requirementsOf = (recipe: RecipeTypes.Recipe<any>): string[] => {
    if (!required.has(recipe.id)) {
      required.set(recipe.id, requirements(recipe, answers[recipe.id] ?? {}));
    }

    return required.get(recipe.id)!;
  };
  const unknown = selected.filter((id) => !byId.has(id));

  if (unknown.length > 0) {
    throw new RecipeError(
      `Unknown module${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Available: ${[...byId.keys()].join(', ')}.`,
    );
  }

  // every recipe reachable through `requires`
  const included = new Set<string>();
  const implied: string[] = [];
  const pending = [...new Set(selected)];

  while (pending.length > 0) {
    const id = pending.shift()!;

    if (included.has(id)) {
      continue;
    }

    const recipe = byId.get(id);

    if (!recipe) {
      throw new RecipeError(`A recipe requires "${id}", which does not exist.`);
    }

    included.add(id);

    if (!selected.includes(id)) {
      implied.push(id);
    }

    pending.push(...requirementsOf(recipe));
  }

  const deploys = [...included].filter((id) => byId.get(id)!.kind === 'deploy');

  if (deploys.length > 1) {
    throw new RecipeError(`Pick one deploy target, got ${deploys.join(' and ')}.`);
  }

  // depth-first topological order, modules before deploy targets, each group
  // in the catalog's order so the result does not depend on how ids were typed
  const ordered: RecipeTypes.Recipe<any>[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === 'done') {
      return;
    }

    if (state.get(id) === 'visiting') {
      throw new RecipeError(`Recipes depend on each other in a cycle: ${[...path, id].join(' -> ')}.`);
    }

    state.set(id, 'visiting');

    const recipe = byId.get(id)!;
    const before = [...requirementsOf(recipe), ...(recipe.after ?? []).filter((other) => included.has(other))];

    for (const other of before) {
      visit(other, [...path, id]);
    }

    state.set(id, 'done');
    ordered.push(recipe);
  };

  const inCatalogOrder = catalog.filter((recipe) => included.has(recipe.id));

  for (const recipe of [
    ...inCatalogOrder.filter((r) => r.kind !== 'deploy'),
    ...inCatalogOrder.filter((r) => r.kind === 'deploy'),
  ]) {
    visit(recipe.id, []);
  }

  return { recipes: ordered, implied };
}

/**
 * The ids a recipe requires for the given answers.
 *
 * @param {RecipeTypes.Recipe} recipe - The recipe
 * @param {Record<string, string>} answers - Its answers
 * @returns {string[]} The ids
 */
function requirements(recipe: RecipeTypes.Recipe<any>, answers: Record<string, string>): string[] {
  return typeof recipe.requires === 'function' ? recipe.requires(answers) : (recipe.requires ?? []);
}
