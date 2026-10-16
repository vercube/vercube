/**
 * Result of converting a router path to OpenAPI path templating.
 */
export interface OpenApiPath {
  /** Path in OpenAPI syntax, e.g. `/pages/{id}`. */
  path: string;
  /** Names of the path parameters, in order of appearance. */
  params: string[];
  /** Parameters declared optional with `?`. */
  optional: string[];
  /** Regular expressions parameters are constrained with, by name. */
  patterns: Record<string, string>;
}

/**
 * Converts a rou3 1.0 route path to OpenAPI path templating.
 *
 * - `:name` becomes `{name}`; its modifier (`?`, `+`, `*`) and regular
 *   expression (`:id(\d+)`) are dropped from the path, `?` making it optional
 *   and the expression becoming its `pattern`
 * - `**:name` (named catch-all) becomes `{name}`
 * - `**` (unnamed catch-all) becomes `{_}`
 * - an unnamed `*`, `(regex)` or `*.png` becomes `{0}`, `{1}`, ... in order
 * - `\:` and `\*` are literal characters, not parameters
 *
 * Parameter names match the keys rou3 puts into `event.params`, so the
 * documented parameters are the ones `@Param` reads. The path always starts
 * with `/`, as rou3 adds it when routing.
 *
 * @param path - The route path as registered in the router.
 * @returns The OpenAPI path and its parameters.
 */
export function toOpenApiPath(path: string): OpenApiPath {
  const result: OpenApiPath = { path: '', params: [], optional: [], patterns: {} };
  let unnamedIndex = 0;

  const add = (name: string, pattern?: string, optional?: boolean): string => {
    result.params.push(name);

    if (pattern) {
      result.patterns[name] = pattern;
    }

    if (optional) {
      result.optional.push(name);
    }

    return `{${name}}`;
  };

  const segments = path.split('/').map((segment) => {
    if (segment === '**') {
      unnamedIndex++;
      return add('_');
    }

    if (segment.startsWith('**:')) {
      return add(segment.slice(3));
    }

    let output = '';
    let index = 0;

    while (index < segment.length) {
      const char = segment[index];

      // an escaped character is a literal
      if (char === '\\' && index + 1 < segment.length) {
        output += segment[index + 1];
        index += 2;
        continue;
      }

      if (char === ':') {
        const name = /^[A-Za-z_]\w*/.exec(segment.slice(index + 1))?.[0];

        if (name) {
          index += 1 + name.length;

          const group = readGroup(segment, index);
          index = group.end;

          const modifier = segment[index];
          if (modifier === '?' || modifier === '+' || modifier === '*') {
            index++;
          }

          output += add(name, group.pattern, modifier === '?');
          continue;
        }
      }

      if (char === '(') {
        const group = readGroup(segment, index);
        index = group.end;
        output += add(String(unnamedIndex++), group.pattern);
        continue;
      }

      if (char === '*') {
        index++;
        output += add(String(unnamedIndex++));
        continue;
      }

      output += char;
      index++;
    }

    return output;
  });

  const joined = segments.join('/');
  result.path = joined.startsWith('/') ? joined : `/${joined}`;

  return result;
}

/**
 * Reads a parenthesized regular expression starting at `start`, if there is one.
 *
 * @param segment - The path segment.
 * @param start - Where the group would start.
 * @returns The expression, without its parentheses, and the index after it.
 */
function readGroup(segment: string, start: number): { pattern?: string; end: number } {
  if (segment[start] !== '(') {
    return { end: start };
  }

  let depth = 0;

  for (let index = start; index < segment.length; index++) {
    if (segment[index] === '\\') {
      index++;
      continue;
    }

    if (segment[index] === '(') {
      depth++;
    } else if (segment[index] === ')' && --depth === 0) {
      return { pattern: segment.slice(start + 1, index), end: index + 1 };
    }
  }

  return { pattern: segment.slice(start + 1), end: segment.length };
}
