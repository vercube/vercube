/**
 * Result of converting a router path to OpenAPI path templating.
 */
export interface OpenApiPath {
  /** Path in OpenAPI syntax, e.g. `/pages/{id}`. */
  path: string;
  /** Names of the path parameters, in order of appearance. */
  params: string[];
}

/**
 * Converts a rou3 route path to OpenAPI path templating.
 *
 * - `:name` becomes `{name}`
 * - `**:name` (named catch-all) becomes `{name}`
 * - `**` (unnamed catch-all) becomes `{_}`
 * - `*` (unnamed segment) becomes `{_0}`, `{_1}`, ...
 *
 * Parameter names match the keys rou3 puts into `event.params`, so the
 * documented parameters are the ones `@Param` reads.
 *
 * @param path - The route path as registered in the router.
 * @returns The OpenAPI path and the names of its parameters.
 */
export function toOpenApiPath(path: string): OpenApiPath {
  const params: string[] = [];
  let unnamedIndex = 0;

  const segments = path.split('/').map((segment) => {
    if (segment === '**') {
      params.push('_');
      return '{_}';
    }

    if (segment.startsWith('**:')) {
      const name = segment.slice(3);
      params.push(name);
      return `{${name}}`;
    }

    if (segment === '*') {
      const name = `_${unnamedIndex++}`;
      params.push(name);
      return `{${name}}`;
    }

    return segment.replace(/:([A-Za-z_]\w*)/g, (_, name: string) => {
      params.push(name);
      return `{${name}}`;
    });
  });

  return { path: segments.join('/'), params };
}
