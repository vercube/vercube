/** Options of {@link getRequestIP}. */
export interface RequestIPOptions {
  /**
   * How many proxies in front of the application to trust.
   *
   * - `false` (default): only the socket address counts, every header is ignored.
   * - a number: the address that many hops from the right of `x-forwarded-for`,
   *   i.e. the one the outermost trusted proxy saw. `1` for a single load balancer.
   * - `true`: the leftmost `x-forwarded-for` address. Only safe when every
   *   request goes through a proxy that overwrites the header, since a client
   *   can put anything there.
   *
   * @default false
   */
  trustProxy?: boolean | number;
}

/**
 * Returns the address of the client that sent a request, or null when it is unknown.
 *
 * Without `trustProxy` it is the socket address the server saw (`request.ip`,
 * set by the Node, Bun and Deno servers). Requests built with `new Request()`,
 * passed to `app.fetch()` or arriving through Nitro or a serverless adapter
 * carry none, so the result is null unless a proxy header is trusted.
 *
 * `x-forwarded-for` is read from the right: each proxy appends the address it
 * received the request from, so the entries a client wrote itself are always
 * the leftmost ones, and only the ones added by trusted proxies are reliable.
 *
 * @param {Request} request - The request
 * @param {RequestIPOptions} [options] - Which proxies to trust
 * @returns {string | null} The client address, or null when unknown
 *
 * @example
 * ```ts
 * // behind one load balancer
 * const ip = getRequestIP(request, { trustProxy: 1 });
 * ```
 */
export function getRequestIP(request: Request, options: RequestIPOptions = {}): string | null {
  const socket = normalize((request as Request & { ip?: unknown }).ip);
  const trust = options.trustProxy ?? false;

  if (trust === false || trust === 0) {
    return socket;
  }

  const forwarded = (request.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((entry) => normalize(entry))
    .filter((entry): entry is string => entry !== null);

  if (forwarded.length === 0) {
    return socket;
  }

  if (trust === true) {
    return forwarded[0];
  }

  // the last trusted proxy appended the address it saw: `trust` entries from the
  // right. Fewer entries than proxies means the chain is shorter than configured,
  // so the leftmost one is the best there is.
  return forwarded[Math.max(0, forwarded.length - Math.trunc(trust))];
}

/**
 * Trims an address and drops the IPv4-mapped IPv6 prefix, so the same client
 * gets the same address whichever way the socket reports it.
 *
 * @param {unknown} value - Raw address
 * @returns {string | null} The address, or null when empty
 */
function normalize(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const address = value.trim();

  if (address === '') {
    return null;
  }

  return address.startsWith('::ffff:') && address.includes('.') ? address.slice(7) : address;
}
