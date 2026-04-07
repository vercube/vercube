import { Controller, Get, Post } from '@vercube/core';
import { RequestContext } from '@vercube/core';
import { Inject } from '@vercube/di';
import { EVLOG_REQUEST_LOGGER_KEY } from '@vercube/evlog';
import type { EvlogTypes } from '@vercube/evlog';

/**
 * Example controller that demonstrates how to use the request-scoped evlog logger.
 *
 * `EvlogMiddleware` (registered globally by `EvlogPlugin`) creates a per-request
 * logger and stores it in `RequestContext` under `EVLOG_REQUEST_LOGGER_KEY`.
 *
 * Any fields set on the logger via `log.set()` are included in the final wide
 * event emitted when the response finishes.
 */
@Controller('/users')
export class UsersController {
  @Inject(RequestContext)
  private requestContext!: RequestContext;

  /**
   * Returns a list of users.
   * Enriches the wide event with `{ resource: 'users', count: 2 }`.
   */
  @Get('/')
  public async list(): Promise<{ users: Array<{ id: number; name: string }> }> {
    const log = this.requestContext.get<EvlogTypes.EvlogRequestLogger>(EVLOG_REQUEST_LOGGER_KEY);

    const users = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];

    log?.set('resource', 'users');
    log?.set('count', users.length);

    return { users };
  }

  /**
   * Returns a single user by id.
   * Enriches the wide event with `{ resource: 'user', userId }`.
   * Emits an error field when the user is not found.
   */
  @Get('/:id')
  public async get(): Promise<{ user: { id: number; name: string } }> {
    const log = this.requestContext.get<EvlogTypes.EvlogRequestLogger>(EVLOG_REQUEST_LOGGER_KEY);

    // Simulate a user lookup
    const user = { id: 1, name: 'Alice' };

    log?.set('resource', 'user');
    log?.set('userId', user.id);

    return { user };
  }

  /**
   * Creates a new user.
   * Demonstrates attaching structured metadata to a write operation.
   */
  @Post('/')
  public async create(): Promise<{ created: boolean }> {
    const log = this.requestContext.get<EvlogTypes.EvlogRequestLogger>(EVLOG_REQUEST_LOGGER_KEY);

    log?.set('resource', 'user');
    log?.set('action', 'create');

    return { created: true };
  }
}
