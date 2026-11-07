/** Where the starter templates are listed, one JSON file per template. */
export const TEMPLATE_REGISTRY = 'https://raw.githubusercontent.com/vercube/starter/main/templates';

/**
 * A base template a project starts from, before any recipe is applied.
 */
export interface Template {
  /** Id used on the command line: `--template api`. */
  id: string;

  /** Name shown in the prompt. */
  label: string;

  /** Name of the template in the starter registry. */
  registryName: string;
}

/**
 * The base templates. `api` is the starter `vercube init` has always created;
 * it keeps the registry name `vercube` so existing links still work.
 */
export const TEMPLATES: readonly Template[] = [{ id: 'api', label: 'API only', registryName: 'vercube' }];

/**
 * Finds a template by id.
 *
 * @param {string} id - The template id
 * @returns {Template | undefined} The template
 */
export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
