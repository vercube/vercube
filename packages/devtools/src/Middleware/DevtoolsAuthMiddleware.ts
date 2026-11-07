import { createHash, timingSafeEqual } from 'node:crypto';
import { BaseMiddleware } from '@vercube/core';
import { Inject } from '@vercube/di';
import { DEVTOOLS_REQUEST_HEADER, DEVTOOLS_TOKEN_COOKIE } from '../Constants/DevtoolsDefaults';
import { $DevtoolsOptions } from '../Symbols/DevtoolsSymbols';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';

/** Methods that only read, so a cross-site request to them cannot change anything. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Guards every devtools endpoint with the configured access token, and every
 * state-changing endpoint against cross-site requests.
 *
 * The token may arrive as the `x-devtools-token` header or as the
 * `vercube_devtools_token` cookie. A `?token=` query parameter is accepted on
 * the UI page alone, to bootstrap a browser session: the UI then moves it into
 * the cookie and drops it from the URL, so it never reaches an API URL.
 *
 * Requests that change something (anything but GET, HEAD and OPTIONS) must
 * also carry the `x-devtools-request` (or `x-devtools-token`) header and must not come from another
 * site. This holds with or without a token: a page the developer happens to
 * visit cannot send a custom header without a CORS preflight, so it cannot
 * clear buffers or run jobs through a plain form or image.
 */
export class DevtoolsAuthMiddleware extends BaseMiddleware {
  @Inject($DevtoolsOptions)
  private readonly gOptions!: DevtoolsTypes.ResolvedOptions;

  /**
   * Rejects cross-site writes and requests that do not carry the configured token.
   * @param request incoming request
   * @returns a 403 for a cross-site write, a 401 when the token is missing or wrong, otherwise nothing
   */
  public onRequest(request: Request): Response | void {
    const url = new URL(request.url);

    if (!SAFE_METHODS.has(request.method.toUpperCase()) && !this.isSameSiteWrite(request, url)) {
      return Response.json({ error: 'Cross-site devtools request rejected' }, { status: 403 });
    }

    const token = this.gOptions.token;

    if (!token) {
      return;
    }

    const isUi = url.pathname.replace(/\/+$/, '') === this.gOptions.path;

    const candidates = [
      request.headers.get('x-devtools-token'),
      this.readCookie(request.headers.get('cookie')),
      // Only the UI page accepts the token in the URL. On an API path it would
      // end up in access and proxy logs for no benefit: the UI has the cookie by then.
      isUi ? url.searchParams.get('token') : null,
    ];

    if (candidates.some((candidate) => this.matches(candidate, token))) {
      return;
    }

    if (isUi) {
      return new Response(
        '<!doctype html><meta charset="utf-8"><title>Vercube Devtools</title>' +
          '<body style="font:14px system-ui;padding:3rem;background:#08090c;color:#e9ebf2">' +
          '<h1 style="font-size:1.1rem">Vercube Devtools</h1>' +
          '<p>This instance is protected. Append <code>?token=…</code> to the URL.</p></body>',
        { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }

    return new Response(JSON.stringify({ error: 'Invalid or missing devtools token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  /**
   * Decides whether a state-changing request may proceed.
   *
   * The custom header is what blocks a cross-site form or image: a browser
   * cannot add it without a preflight. The fetch metadata and `Origin` checks
   * cover an app whose CORS policy would approve that preflight anyway.
   * `Sec-Fetch-Site` is preferred because it is the browser's own verdict and
   * survives a proxy rewriting `Host`; `Origin` is the fallback for older browsers.
   *
   * @param request incoming request
   * @param url parsed request URL
   * @returns whether the request carries the header and is not cross-site
   */
  private isSameSiteWrite(request: Request, url: URL): boolean {
    // `x-devtools-token` is a custom header too, so a script that already sends
    // it does not need a second one.
    if (!request.headers.get(DEVTOOLS_REQUEST_HEADER) && !request.headers.get('x-devtools-token')) {
      return false;
    }

    const site = request.headers.get('sec-fetch-site');

    if (site) {
      return site === 'same-origin' || site === 'none';
    }

    const origin = request.headers.get('origin');

    if (!origin) {
      // Not sent by a browser (curl, scripts, server-side callers): nothing to forge.
      return true;
    }

    try {
      return new URL(origin).host === url.host;
    } catch {
      // `Origin: null` and other opaque values never match.
      return false;
    }
  }

  /**
   * Compares a candidate against the configured token without leaking its length through timing.
   * Both sides are hashed first, so the comparison always runs over two equal-length digests.
   * @param candidate value taken from the request, when present
   * @param token the configured token
   * @returns whether the candidate is the token
   */
  private matches(candidate: string | null, token: string): boolean {
    if (!candidate) {
      return false;
    }

    const provided = createHash('sha256').update(candidate, 'utf8').digest();
    const expected = createHash('sha256').update(token, 'utf8').digest();

    return timingSafeEqual(provided, expected);
  }

  /**
   * @param header raw `Cookie` header, when present
   * @returns the devtools token carried by the cookie, or null
   */
  private readCookie(header: string | null): string | null {
    if (!header) {
      return null;
    }

    for (const pair of header.split(';')) {
      const separator = pair.indexOf('=');

      if (separator > 0 && pair.slice(0, separator).trim() === DEVTOOLS_TOKEN_COOKIE) {
        try {
          return decodeURIComponent(pair.slice(separator + 1).trim());
        } catch {
          // A malformed cookie is not a token; fall through to the other candidates.
          return null;
        }
      }
    }

    return null;
  }
}
