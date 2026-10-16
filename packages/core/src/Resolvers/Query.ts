import { isSafeProperty } from '../Utils/Security';
import { getRequestSearch } from '../Utils/Url';
import type { RouterTypes } from '../Types/RouterTypes';

/**
 * Decodes one urlencoded component the way the WHATWG urlencoded parser does.
 *
 * `decodeURIComponent` throws on anything the parser instead handles: `%zz` is
 * kept verbatim, and a sequence that is valid hex but invalid UTF-8, such as
 * `%E0%A4%A`, decodes to a replacement character followed by whatever is left.
 * Both cases go back through `URLSearchParams` for that one component, so a
 * malformed request target reaches the handler with exactly the value it did
 * before rather than raising a 500 or an undecoded string.
 *
 * The component cannot contain `&`, having been sliced between separators, and
 * a key cannot contain `=`, so wrapping it in a one-parameter query is safe.
 *
 * @param raw - The raw component, still percent-encoded
 * @returns The decoded component
 */
function decodeComponent(raw: string): string {
  const plussed = raw.includes('+') ? raw.replaceAll('+', ' ') : raw;

  if (!plussed.includes('%')) {
    return plussed;
  }

  try {
    return decodeURIComponent(plussed);
  } catch {
    return new URLSearchParams(`_=${plussed}`).get('_') ?? plussed;
  }
}

/**
 * Resolves a single query parameter from the URL of a router event
 *
 * Scans the search string instead of building a `URLSearchParams`, which parses
 * and decodes every key and every value of the whole query to hand back one of
 * them. Measured on `?name=bun`, this is ~40ns against ~62ns, and the gap grows
 * with the number of parameters the request carries.
 *
 * Follows `URLSearchParams.get`: the first match wins, a key without `=` yields
 * an empty string, empty segments are skipped, and both sides are decoded with
 * `+` treated as a space. A missing parameter yields `undefined` rather than
 * `null`, so validation schemas can mark it with `.optional()`.
 *
 * @param name - The name of the query parameter to resolve
 * @param event - The router event containing the request URL
 * @returns The value of the query parameter if found, undefined otherwise
 */
export function resolveQueryParam(name: string, event: RouterTypes.RouterEvent): string | undefined {
  const search = getRequestSearch(event.request);

  if (search === '' || search === '?') {
    return undefined;
  }

  const length = search.length;
  let cursor = search.codePointAt(0) === 63 /* ? */ ? 1 : 0;

  while (cursor < length) {
    let end = search.indexOf('&', cursor);

    if (end === -1) {
      end = length;
    }

    if (end === cursor) {
      cursor = end + 1;
      continue;
    }

    let separator = search.indexOf('=', cursor);

    if (separator === -1 || separator > end) {
      separator = end;
    }

    const key = decodeComponent(search.slice(cursor, separator));

    if (key === name) {
      return separator === end ? '' : decodeComponent(search.slice(separator + 1, end));
    }

    cursor = end + 1;
  }

  return undefined;
}

/**
 * Resolves every value of a query parameter, in the order they appear.
 *
 * @param name - The name of the query parameter to resolve
 * @param event - The router event containing the request URL
 * @returns The values, empty when the parameter is missing
 */
export function resolveQueryParamAll(name: string, event: RouterTypes.RouterEvent): string[] {
  const search = getRequestSearch(event.request);

  return search === '' || search === '?' ? [] : new URLSearchParams(search).getAll(name);
}

/**
 * Resolves all query parameters from the URL of a router event.
 *
 * Like {@link resolveQueryParam}, a repeated key resolves to its first value,
 * unless it is listed in `arrays`: those resolve to every value they carry.
 *
 * @param event - The router event containing the request URL
 * @param arrays - Keys resolved as arrays of all their values
 * @returns An object containing all query parameters
 */
export function resolveQueryParams(
  event: RouterTypes.RouterEvent,
  arrays: ReadonlySet<string> = new Set(),
): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};
  const search = getRequestSearch(event.request);

  if (search === '') {
    return params;
  }

  for (const [key, value] of new URLSearchParams(search)) {
    // the query is attacker-controlled: `__proto__` must not reach the prototype
    if (!isSafeProperty(key)) {
      continue;
    }

    if (arrays.has(key)) {
      const current = Object.hasOwn(params, key) ? params[key] : undefined;

      if (Array.isArray(current)) {
        current.push(value);
      } else {
        params[key] = [value];
      }
    } else if (!Object.hasOwn(params, key)) {
      params[key] = value;
    }
  }

  return params;
}
