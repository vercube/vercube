import { addRoute, createRouter, findRoute } from 'rou3';
import type { WebsocketTypes } from '../Types/WebsocketTypes';
import type { RouterContext } from 'rou3';

/**
 * A namespace a path matched.
 */
export interface NamespaceMatch {
  /** The namespace pattern, lowercased, which is the key of its handlers. */
  pattern: string;
  /** Parameters taken from the path. */
  params: WebsocketTypes.NamespaceParams;
}

/**
 * Matches request paths against the registered namespaces, with the same
 * pattern syntax as the HTTP router (`rou3`): `:name` for one segment, `*` for
 * an unnamed segment and `**:name` (or `**`) for the rest of the path.
 *
 * Namespaces are case-insensitive, as they always were, so the patterns and
 * the path are lowercased to find the namespace. Parameter names and values
 * are then taken from the pattern and the path as written, so `:boardId`
 * stays `boardId` and an id keeps its case.
 */
export class NamespaceMatcher {
  /** rou3 router keyed by the lowercased patterns */
  private readonly fRouter: RouterContext<string> = createRouter<string>();

  /** Patterns as written, by their lowercased form */
  private readonly fPatterns: Map<string, string> = new Map();

  /**
   * Adds a namespace pattern. Adding the same pattern twice does nothing.
   *
   * @param {string} pattern - The pattern, such as `/ws/boards/:boardId`
   * @returns {void}
   */
  public add(pattern: string): void {
    const key = pattern.toLowerCase();

    if (this.fPatterns.has(key)) {
      return;
    }

    // keep the first spelling: `registerHandler()` hands patterns already lowercased
    this.fPatterns.set(key, pattern);
    addRoute(this.fRouter, '', key, key);
  }

  /**
   * Whether the pattern was added.
   *
   * @param {string} pattern - The pattern
   * @returns {boolean} Whether it is known
   */
  public has(pattern: string): boolean {
    return this.fPatterns.has(pattern.toLowerCase());
  }

  /**
   * Finds the namespace a path belongs to.
   *
   * @param {string} path - The path of the upgrade request, without the query
   * @returns {NamespaceMatch | undefined} The namespace and its parameters, or nothing
   */
  public match(path: string): NamespaceMatch | undefined {
    const lowered = path.toLowerCase();

    // a static namespace is the common case, and needs no parameters
    if (this.fPatterns.has(lowered) && !lowered.includes(':') && !lowered.includes('*')) {
      return { pattern: lowered, params: {} };
    }

    const found = findRoute(this.fRouter, '', lowered);

    if (!found) {
      return undefined;
    }

    return {
      pattern: found.data,
      params: extractParams(this.fPatterns.get(found.data) ?? found.data, path),
    };
  }
}

/**
 * Reads the parameters of a path from the pattern it matched, segment by
 * segment, decoding each value like `@Param()` does over HTTP.
 *
 * @param {string} pattern - The pattern as written
 * @param {string} path - The path as requested
 * @returns {WebsocketTypes.NamespaceParams} The parameters
 */
function extractParams(pattern: string, path: string): WebsocketTypes.NamespaceParams {
  const params: WebsocketTypes.NamespaceParams = Object.create(null);
  const patternSegments = pattern.split('/');
  const pathSegments = path.split('/');
  let unnamed = 0;

  for (let i = 0; i < patternSegments.length; i++) {
    const segment = patternSegments[i];

    if (segment.startsWith('**')) {
      params[segment.slice(3) || '_'] = decode(pathSegments.slice(i).join('/'));
      break;
    }

    if (segment === '*') {
      params[String(unnamed++)] = decode(pathSegments[i] ?? '');
    } else if (segment.startsWith(':')) {
      params[segment.slice(1)] = decode(pathSegments[i] ?? '');
    }
  }

  return params;
}

/**
 * Decodes a path parameter, keeping a malformed sequence verbatim.
 *
 * @param {string} value - The raw value
 * @returns {string} The decoded value
 */
function decode(value: string): string {
  if (!value.includes('%')) {
    return value;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
