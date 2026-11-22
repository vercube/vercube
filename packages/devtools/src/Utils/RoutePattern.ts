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

/** An exclusion pattern, taken apart. */
interface RoutePattern {
  /** Method the pattern is narrowed to, uppercase. Absent when it covers every method. */
  method?: string;
  /** Segments of the path pattern. Absent for a method on its own, which covers every path. */
  segments?: string[];
}

/**
 * Takes an exclusion pattern apart.
 *
 * A pattern is a route template (`/admin/**`), a method and a template
 * (`DELETE /users/:id`), or a method alone (`DELETE`). Anything else is a
 * mistake, and a mistake in a list of routes that must not be called is not
 * something to guess at: `admin/**` silently matching nothing would leave
 * every admin route on offer.
 *
 * @param pattern - The pattern as written in the options
 * @returns The parts of the pattern
 * @throws Error naming what is wrong with the pattern
 */
export function parseRoutePattern(pattern: string): RoutePattern {
  const words = pattern.trim().split(/\s+/).filter(Boolean);
  const [first, second] = words;

  if (words.length === 1 && first.startsWith('/')) {
    return { segments: toSegments(first) };
  }

  if (words.length === 1 && METHODS.has(first.toUpperCase())) {
    return { method: first.toUpperCase() };
  }

  if (words.length === 2 && METHODS.has(first.toUpperCase()) && second.startsWith('/')) {
    return { method: first.toUpperCase(), segments: toSegments(second) };
  }

  if (words.length === 2 && second.startsWith('/')) {
    throw new Error(`Invalid route pattern "${pattern}": "${first}" is not an HTTP method.`);
  }

  throw new Error(
    `Invalid route pattern "${pattern}": write a route template that starts with "/" (such as "/admin/**"), ` +
      'a method and a template ("DELETE /users/:id"), or a method alone ("DELETE").',
  );
}

/**
 * Splits the template of a pattern into segments. A run of `**` is one `**`:
 * it matches the same routes, and every extra one doubles the work of matching.
 *
 * @param template - The path part of a pattern
 * @returns Its segments
 */
function toSegments(template: string): string[] {
  return trim(template)
    .split('/')
    .filter((segment, index, all) => !(segment === '**' && all[index - 1] === '**'));
}

/**
 * Whether path segments match pattern segments.
 *
 * @param expected - Segments of the pattern
 * @param actual - Segments of the route template
 * @returns True when the pattern covers the template
 */
function matchesSegments(expected: string[], actual: string[]): boolean {
  if (expected.length === 0) {
    return actual.length === 0;
  }

  const [segment, ...rest] = expected;

  if (segment === '**') {
    // Any number of segments, none included: try every place the rest could start.
    for (let skipped = 0; skipped <= actual.length; skipped++) {
      if (matchesSegments(rest, actual.slice(skipped))) {
        return true;
      }
    }

    return false;
  }

  return actual.length > 0 && (segment === '*' || segment === actual[0]) && matchesSegments(rest, actual.slice(1));
}

/**
 * Whether a route matches an exclusion pattern.
 *
 * A pattern is a route template, optionally with a method in front, or a
 * method alone: `/admin/**`, `/users/:id`, `DELETE /users/:id`, `DELETE`. It
 * is compared with the template the route was registered under, not with a
 * concrete URL, so `/users/:id` names exactly that route. `*` stands for one
 * path segment (whatever it is called in the template) and `**` for any number
 * of them, none included, wherever it is written: `/admin/**` covers `/admin`
 * itself, and `/**\/refund` covers `/refund` and `/orders/:id/refund`.
 *
 * A route that answers two methods (a `GET` with its `HEAD` twin) matches a
 * pattern that names either.
 *
 * @param pattern - The exclusion pattern
 * @param method - Method of the route, or its methods joined with ` / `
 * @param path - Template of the route
 * @returns True when the pattern covers the route; false for a pattern that is not valid
 */
export function matchesRoutePattern(pattern: string, method: string, path: string): boolean {
  let parsed: RoutePattern;

  try {
    parsed = parseRoutePattern(pattern);
  } catch {
    // The plugin refuses an invalid pattern when it starts. Here it covers nothing.
    return false;
  }

  if (
    parsed.method !== undefined &&
    !method
      .toUpperCase()
      .split('/')
      .some((entry) => entry.trim() === parsed.method)
  ) {
    return false;
  }

  return parsed.segments === undefined || matchesSegments(parsed.segments, trim(path).split('/'));
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
