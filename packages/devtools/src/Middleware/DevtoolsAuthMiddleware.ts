import { timingSafeEqual } from 'node:crypto';
import { BaseMiddleware } from '@vercube/core';
import { Inject } from '@vercube/di';
import { DEVTOOLS_TOKEN_COOKIE } from '../Constants/DevtoolsDefaults';
import { $DevtoolsOptions } from '../Symbols/DevtoolsSymbols';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';

/**
 * Guards every devtools endpoint with the configured access token.
 *
 * The token may arrive as the `x-devtools-token` header or as the
 * `vercube_devtools_token` cookie. A `?token=` query parameter is accepted on
 * the UI page alone, to bootstrap a browser session: the UI then moves it into
 * the cookie and drops it from the URL, so it never reaches an API URL.
 */
export class DevtoolsAuthMiddleware extends BaseMiddleware {
  @Inject($DevtoolsOptions)
  private readonly gOptions!: DevtoolsTypes.ResolvedOptions;

  /**
   * Rejects requests that do not carry the configured token.
   * @param request incoming request
   * @returns a 401 response when the token is missing or wrong, otherwise nothing
   */
  public onRequest(request: Request): Response | void {
    const token = this.gOptions.token;

    if (!token) {
      return;
    }

    const url = new URL(request.url);
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
   * Compares a candidate against the configured token without leaking its length through timing.
   * @param candidate value taken from the request, when present
   * @param token the configured token
   * @returns whether the candidate is the token
   */
  private matches(candidate: string | null, token: string): boolean {
    if (!candidate) {
      return false;
    }

    const provided = Buffer.from(candidate, 'utf8');
    const expected = Buffer.from(token, 'utf8');

    return provided.length === expected.length && timingSafeEqual(provided, expected);
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
