import { isUnderMount } from './Mount';
import type { IntrospectionTypes } from '@vercube/core';

/** HTTP methods a pattern may start with. */
const METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE']);

/**
 * Removes trailing slashes, keeping the root path.
 *
 * @param path - A path or a path pattern
 * @returns The path without trailing slashes
 */
function trim(path: string): string {
  return path.replace(/\/+$/, '') || '/';
}

/**
 * Whether a route matches an exclusion pattern.
 *
 * A pattern is a route template, optionally with a method in front:
 * `/admin/**`, `/users/:id`, `DELETE /users/:id`. It is compared with the
 * template the route was registered under, not with a concrete URL, so
 * `/users/:id` names exactly that route. `*` stands for one path segment
 * (whatever it is called in the template) and `**` for any number of them,
 * none included: `/admin/**` covers `/admin` itself.
 *
 * @param pattern - The exclusion pattern
 * @param method - Method of the route
 * @param path - Template of the route
 * @returns True when the pattern covers the route
 */
export function matchesRoutePattern(pattern: string, method: string, path: string): boolean {
  const parts = pattern.trim().split(/\s+/);
  const hasMethod = parts.length > 1 && METHODS.has(parts[0].toUpperCase());

  if (hasMethod && parts[0].toUpperCase() !== method.toUpperCase()) {
    return false;
  }

  const expected = trim(hasMethod ? parts.slice(1).join(' ') : pattern.trim()).split('/');
  const actual = trim(path).split('/');

  for (const [index, segment] of expected.entries()) {
    if (segment === '**') {
      // Everything below, and the parent itself.
      return true;
    }

    if (index >= actual.length) {
      return false;
    }

    if (segment !== '*' && segment !== actual[index]) {
      return false;
    }
  }

  return expected.length === actual.length;
}

/**
 * Lists the routes the playground must not offer.
 *
 * Devtools' own routes are always among them: they are the inspector's
 * plumbing, and a request sent to them is not recorded anyway.
 *
 * @param routes - The described route table
 * @param exclude - Patterns from the plugin options
 * @param mount - The devtools mount path
 * @returns The ids of the excluded routes
 */
export function excludedRoutes(routes: IntrospectionTypes.RouteDescription[], exclude: string[], mount: string): string[] {
  return routes
    .filter(
      (route) =>
        isUnderMount(route.path, mount) || exclude.some((pattern) => matchesRoutePattern(pattern, route.method, route.path)),
    )
    .map((route) => route.id);
}
