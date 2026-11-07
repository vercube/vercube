/**
 * A recipe that cannot be resolved or applied. The message says what to do
 * about it, and the CLI prints it without a stack trace.
 */
export class RecipeError extends Error {
  public override name: string = 'RecipeError';
}
