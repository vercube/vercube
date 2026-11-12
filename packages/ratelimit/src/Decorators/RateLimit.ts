import { addMetadataMiddleware, initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { DEFAULT_PRIORITY, RATE_LIMIT_SLOT } from '../Common/Constants';
import { RateLimitMiddleware } from '../Middleware/RateLimitMiddleware';
import { validate } from '../Services/RateLimitManager';
import type { RateLimitTypes } from '../Types/RateLimitTypes';
import type { MetadataTypes } from '@vercube/core';

/**
 * Limits how many requests a client can make to a route, or to every route of
 * a controller, per window. Over the limit the route answers `429 Too Many
 * Requests` with a `Retry-After` header.
 *
 * The limit closest to the route wins: one on a method replaces the
 * controller's, which replaces the app-wide one from `vercube.config.ts`.
 * Exactly one limit counts each request. `@RateLimit(false)` lifts every limit
 * from the route.
 *
 * A limit on a method counts per route; on a controller it is one counter for
 * all its routes. Options left out come from the `rateLimit` config section.
 *
 * @param {Partial<RateLimitTypes.Options> | false} [options] - The limit, or `false` to lift it
 * @returns {Function} The decorator
 * @throws {RateLimitError} When an option is invalid, at startup
 *
 * @example
 * ```ts
 * @Controller('/auth')
 * class AuthController {
 *   @Post('/login')
 *   @RateLimit({ limit: 5, window: '1m' })
 *   login() {}
 *
 *   @Get('/status')
 *   @RateLimit(false)
 *   status() {}
 * }
 * ```
 */
export function RateLimit(options: Partial<RateLimitTypes.Options> | false = {}): Function {
  return function internalDecorator(target: Function | object, propertyName?: string): void {
    const ctx = (propertyName ? target : (target as Function).prototype) as MetadataTypes.Metadata;
    const meta = initializeMetadata(ctx);

    if (propertyName) {
      initializeMetadataMethod(ctx, propertyName);
    }

    const owner = propertyName ? (target as object).constructor.name : (target as Function).name;

    if (options === false) {
      addMetadataMiddleware(meta, {
        target: propertyName ?? '__global__',
        middleware: RateLimitMiddleware,
        slot: RATE_LIMIT_SLOT,
        skip: true,
      });

      return;
    }

    const name = options.name ?? (propertyName ? `${owner}.${propertyName}` : owner);
    const windowMs = validate({ ...options, name }, `@RateLimit() on ${propertyName ? `${owner}.${propertyName}` : owner}`);
    const { window: _window, priority, ...rest } = options;

    addMetadataMiddleware(meta, {
      target: propertyName ?? '__global__',
      priority: priority ?? DEFAULT_PRIORITY,
      middleware: RateLimitMiddleware,
      slot: RATE_LIMIT_SLOT,
      args: { ...rest, name, ...(windowMs === undefined ? {} : { windowMs }) } satisfies RateLimitTypes.DeclaredOptions,
    });
  };
}

/**
 * Lifts every rate limit from a route or a controller, the app-wide one
 * included. Same as `@RateLimit(false)`.
 *
 * @returns {Function} The decorator
 */
export function SkipRateLimit(): Function {
  return RateLimit(false);
}
