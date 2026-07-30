import { BaseMiddleware } from '@vercube/core';
import { Inject } from '@vercube/di';
import { $DevtoolsOptions } from '../Symbols/DevtoolsSymbols';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';

/**
 * Guards every devtools endpoint with the configured access token.
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
    const provided = request.headers.get('x-devtools-token') ?? url.searchParams.get('token');

    if (provided === token) {
      return;
    }

    const isUi = url.pathname.replace(/\/+$/, '') === this.gOptions.path;

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
}
