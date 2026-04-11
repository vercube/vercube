import { Controller, Get, Post } from '@vercube/core';
import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';

/**
 * Example controller that demonstrates request-scoped logging context with evlog.
 *
 * Use `logger.setContext(key, value)` to enrich the wide event emitted by
 * `EvlogMiddleware` at the end of each request. No need to access `RequestContext` —
 * just inject `Logger` and use it.
 */
@Controller('/users')
export class UsersController {
  @Inject(Logger)
  private logger!: Logger;

  /**
   * Returns a list of users.
   * Enriches the wide event with `{ resource: 'users', count: 2 }`.
   */
  @Get('/')
  public async list(): Promise<{ users: Array<{ id: number; name: string }> }> {
    const users = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];

    this.logger.setContext('resource', 'users');
    this.logger.setContext('count', users.length);

    return { users };
  }

  /**
   * Returns a single user by id.
   * Enriches the wide event with `{ resource: 'user', userId }`.
   */
  @Get('/:id')
  public async get(): Promise<{ user: { id: number; name: string } }> {
    const user = { id: 1, name: 'Alice' };

    this.logger.setContext('resource', 'user');
    this.logger.setContext('userId', user.id);

    return { user };
  }

  /**
   * Creates a new user.
   * Demonstrates attaching structured metadata to a write operation.
   */
  @Post('/')
  public async create(): Promise<{ created: boolean }> {
    this.logger.setContext('resource', 'user');
    this.logger.setContext('action', 'create');

    return { created: true };
  }
}
