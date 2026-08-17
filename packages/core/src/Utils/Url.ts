/**
 * Fast, allocation-free accessors for the parts of a request URL that the
 * router and the argument resolvers actually need.
 *
 * `new URL(request.url)` fully parses (and re-encodes) the URL on every call,
 * which is one of the most expensive things a framework can do per request.
 * Two cheaper sources are used instead, in order of preference:
 *
 * 1. On Node, srvx keeps the original `http.IncomingMessage` reachable through
 *    `request.runtime.node.req`. Its `url` is the raw request target - already
 *    exactly `pathname + search` - so no parsing happens at all.
 * 2. srvx otherwise exposes a lazily-parsed `FastURL` as `request._url`.
 *
 * The final fallback is plain string indexing on `request.url`, which still
 * avoids the native URL parser.
 */

/** Shape of the lazily-parsed URL that srvx attaches to its request objects. */
interface FastRequestURL {
  pathname: string;
  search: string;
}

/** Request augmented with the srvx internals we opportunistically read from. */
interface SrvxRequest extends Request {
  _url?: FastRequestURL;
  runtime?: {
    name?: string;
    node?: { req?: { url?: string } };
  };
}

/** Character code of `/`, used to detect origin-form request targets. */
const SLASH = 47;

/**
 * Returns the raw request target (`pathname + search`) when the runtime can
 * hand it over without any parsing.
 *
 * Absolute-form (`http://host/path`) and asterisk-form (`*`) request targets
 * are rejected here so that the caller falls back to a real URL parse.
 *
 * @param {Request} request - The incoming request.
 * @returns {string | undefined} The raw request target, if usable.
 */
function rawTarget(request: Request): string | undefined {
  const target = (request as SrvxRequest).runtime?.node?.req?.url;

  return target !== undefined && target.codePointAt(0) === SLASH ? target : undefined;
}

/**
 * Returns the index at which the path of an absolute URL starts.
 *
 * @param {string} url - Absolute request URL.
 * @returns {number} Index of the first `/` of the path, or `-1` when not found.
 */
function pathStart(url: string): number {
  // Skip the scheme separator ("://") and then the authority component.
  const schemeEnd = url.indexOf('://');
  return schemeEnd === -1 ? -1 : url.indexOf('/', schemeEnd + 3);
}

/**
 * Extracts the pathname of a request without building a `URL` object.
 *
 * @param {Request} request - The incoming request.
 * @returns {string} The request pathname, e.g. `/users/1`.
 */
export function getRequestPathname(request: Request): string {
  const target = rawTarget(request);

  if (target !== undefined) {
    const queryIndex = target.indexOf('?');
    return queryIndex === -1 ? target : target.slice(0, queryIndex);
  }

  const fast = (request as SrvxRequest)._url;

  if (fast !== undefined) {
    return fast.pathname;
  }

  const url = request.url;
  const start = pathStart(url);

  if (start === -1) {
    return '/';
  }

  const queryIndex = url.indexOf('?', start);
  const hashIndex = url.indexOf('#', start);
  let end = url.length;

  if (queryIndex !== -1) {
    end = queryIndex;
  }

  if (hashIndex !== -1 && hashIndex < end) {
    end = hashIndex;
  }

  return start === end ? '/' : url.slice(start, end);
}

/**
 * Extracts the query string of a request (including the leading `?`) without
 * building a `URL` object.
 *
 * @param {Request} request - The incoming request.
 * @returns {string} The search string, or an empty string when there is none.
 */
export function getRequestSearch(request: Request): string {
  const target = rawTarget(request);

  if (target !== undefined) {
    const queryIndex = target.indexOf('?');
    return queryIndex === -1 ? '' : target.slice(queryIndex);
  }

  const fast = (request as SrvxRequest)._url;

  if (fast !== undefined) {
    return fast.search;
  }

  const url = request.url;
  const start = pathStart(url);
  const queryIndex = url.indexOf('?', start === -1 ? 0 : start);

  if (queryIndex === -1) {
    return '';
  }

  const hashIndex = url.indexOf('#', queryIndex);
  return hashIndex === -1 ? url.slice(queryIndex) : url.slice(queryIndex, hashIndex);
}
