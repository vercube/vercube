/**
 * Path templates and URLs of the route playground.
 *
 * Everything here is a pure function of its arguments, so the URL preview, the
 * request that is sent and the exported snippets cannot disagree.
 */

/** One placeholder of a route template. */
export interface PathParam {
  /** Name the value is entered under: `id` for `:id`, `*` and `**` for wildcards. */
  name: string;
  /** True for `**`, which swallows the rest of the path, slashes included. */
  rest: boolean;
}

/** A name and a value: a query entry, a header, a form field. */
export interface Pair {
  name: string;
  value: string;
}

/** A path built from a template. */
export interface BuiltPath {
  path: string;
  /** Placeholders that had no value. They stay in the path as written. */
  missing: string[];
}

/** A `:name` placeholder inside one path segment. */
const NAMED = /:([A-Za-z_]\w*)/g;

/**
 * Lists the placeholders of a route template, in order.
 *
 * The router's syntax is `:name` for one segment (or part of one), `*` for one
 * unnamed segment and `**` or `**:name` for the rest of the path.
 *
 * @param template - Route template, such as `/users/:id`
 * @returns The placeholders
 */
export function pathParams(template: string): PathParam[] {
  const params: PathParam[] = [];

  for (const segment of template.split('/')) {
    if (segment === '*') {
      params.push({ name: '*', rest: false });
    } else if (segment === '**') {
      params.push({ name: '**', rest: true });
    } else if (segment.startsWith('**:')) {
      params.push({ name: segment.slice(3), rest: true });
    } else {
      for (const match of segment.matchAll(NAMED)) {
        params.push({ name: match[1], rest: false });
      }
    }
  }

  return params;
}

/**
 * Encodes a value for the rest-of-path placeholder, keeping its slashes.
 *
 * @param value - The entered value
 * @returns The encoded path fragment
 */
function encodeRest(value: string): string {
  return value
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

/**
 * Fills a route template with values.
 *
 * A placeholder without a value is left in place, so the preview shows what is
 * still missing, and is reported so the caller can refuse to send.
 *
 * @param template - Route template
 * @param values - Values by placeholder name
 * @returns The path and the placeholders left unfilled
 */
export function buildPath(template: string, values: Record<string, string>): BuiltPath {
  const missing: string[] = [];

  /**
   * Reads one value, noting when there is none.
   *
   * @param name - Placeholder name
   * @returns The value, or undefined
   */
  const read = (name: string): string | undefined => {
    const value = values[name];

    if (value === undefined || value === '') {
      missing.push(name);

      return undefined;
    }

    return value;
  };

  const path = template
    .split('/')
    .map((segment) => {
      if (segment === '*' || segment === '**') {
        const value = read(segment);

        if (value === undefined) {
          return segment;
        }

        return segment === '**' ? encodeRest(value) : encodeURIComponent(value);
      }

      if (segment.startsWith('**:')) {
        const value = read(segment.slice(3));

        return value === undefined ? segment : encodeRest(value);
      }

      return segment.replaceAll(NAMED, (placeholder, name: string) => {
        const value = read(name);

        return value === undefined ? placeholder : encodeURIComponent(value);
      });
    })
    .join('/');

  return { path: path || '/', missing };
}

/**
 * Serialises query entries. An entry without a name or without a value is
 * left out; a name may repeat.
 *
 * @param query - The entries
 * @returns The query string without the question mark, or an empty string
 */
export function buildQuery(query: Pair[]): string {
  const params = new URLSearchParams();

  for (const { name, value } of query) {
    if (name.trim() && value !== '') {
      params.append(name.trim(), value);
    }
  }

  return params.toString();
}

/**
 * Builds the path and query of a request.
 *
 * @param template - Route template
 * @param values - Path values by placeholder name
 * @param query - Query entries
 * @returns The target relative to the origin, and the placeholders left unfilled
 */
export function buildTarget(template: string, values: Record<string, string>, query: Pair[]): BuiltPath {
  const { path, missing } = buildPath(template, values);
  const search = buildQuery(query);

  return { path: search ? `${path}?${search}` : path, missing };
}

/** The URL a target resolves to, or why it must not be sent. */
export type ResolvedTarget = { ok: true; href: string } | { ok: false; reason: string };

/**
 * Percent-decodes a path for comparison, leaving it as written when it holds
 * a sequence that is not valid.
 *
 * @param path - A URL path
 * @returns The decoded path
 */
function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Resolves a built target the way the browser will, and refuses it when the
 * request would not go where the form says.
 *
 * `fetch` treats its argument as a URL reference, not as a path. A target that
 * starts with two slashes names another host, and `.` and `..` segments are
 * removed before the request leaves, so the text that was built and the
 * request that is sent can differ. This resolves the target once, checks that
 * the result is still this origin and still the path that was built, and
 * returns the one URL that is shown, confirmed, exported and sent.
 *
 * @param target - Path and query, as {@link buildTarget} returns them
 * @param origin - Origin of the page, such as `http://localhost:3000`
 * @returns The resolved URL, or the reason nothing may be sent
 */
export function resolveTarget(target: string, origin: string): ResolvedTarget {
  const mark = target.indexOf('?');
  const path = mark === -1 ? target : target.slice(0, mark);
  const search = mark === -1 ? '' : target.slice(mark);

  let base: URL;
  let resolved: URL;

  try {
    base = new URL(origin);
    resolved = new URL(target, base);
  } catch {
    return { ok: false, reason: 'This does not form a URL.' };
  }

  if (resolved.origin !== base.origin) {
    return {
      ok: false,
      reason: `This would be sent to ${resolved.origin}, not to this application. A path cannot start with two slashes.`,
    };
  }

  // The parser may percent-encode a character the template wrote plainly,
  // which changes the spelling and not the path, so the two are compared
  // decoded. A removed dot segment survives no decoding.
  if (resolved.pathname !== path && decodePath(resolved.pathname) !== decodePath(path)) {
    return {
      ok: false,
      reason: `The browser would send ${resolved.pathname} instead of ${path}: "." and ".." segments are resolved before a request leaves.`,
    };
  }

  if (resolved.search !== search || resolved.hash !== '') {
    return { ok: false, reason: 'The query of this URL would change on the way out.' };
  }

  return { ok: true, href: resolved.href };
}
