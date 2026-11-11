import { createHash, timingSafeEqual } from 'node:crypto';
import { BaseMiddleware } from '@vercube/core';
import { Inject } from '@vercube/di';
import { SCHEMA_TOKEN_HEADER } from '../Constants/SchemaDefaults';
import { $SchemaPluginOptions } from '../Symbols/SchemaSymbols';
import type { SchemaResolvedOptions } from '../Types/SchemaPluginOptions';

/**
 * Guards the schema endpoints with the configured access token. Does nothing
 * when no token is set.
 *
 * The token is read from the `x-schema-token` header. The Scalar page also
 * accepts it as `?token=`, so it can be opened in a browser; the JSON endpoint
 * does not, to keep the token out of access logs for scripted callers.
 */
export class SchemaAuthMiddleware extends BaseMiddleware {
  @Inject($SchemaPluginOptions)
  private readonly gOptions!: SchemaResolvedOptions;

  /**
   * Rejects requests that do not carry the configured token.
   * @param request incoming request
   * @returns a 401 when the token is missing or wrong, otherwise nothing
   */
  public onRequest(request: Request): Response | void {
    const token = this.gOptions.token;

    if (!token) {
      return;
    }

    const url = new URL(request.url);
    const isDocs = url.pathname.replace(/\/+$/, '') === `${this.gOptions.path}/docs`;

    const candidates = [request.headers.get(SCHEMA_TOKEN_HEADER), isDocs ? url.searchParams.get('token') : null];

    if (candidates.some((candidate) => matches(candidate, token))) {
      return;
    }

    return Response.json({ error: 'Invalid or missing schema token' }, { status: 401 });
  }
}

/**
 * Compares a candidate against the token without leaking its length through timing.
 * @param candidate value taken from the request, when present
 * @param token the configured token
 * @returns whether the candidate is the token
 */
function matches(candidate: string | null, token: string): boolean {
  if (!candidate) {
    return false;
  }

  const provided = createHash('sha256').update(candidate, 'utf8').digest();
  const expected = createHash('sha256').update(token, 'utf8').digest();

  return timingSafeEqual(provided, expected);
}
