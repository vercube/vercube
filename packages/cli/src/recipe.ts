// Public API for module recipes, applied by `vercube init` and `vercube add`.
// Import from '@vercube/cli/recipe':
//
//   import { defineRecipe } from '@vercube/cli/recipe';

export { defineRecipe, applyRecipes } from './Recipes/Apply';
export { resolveRecipes } from './Recipes/Resolve';
export { Project } from './Recipes/Project';
export { RecipeError } from './Recipes/RecipeError';
export type { RecipeTypes } from './Recipes/RecipeTypes';
