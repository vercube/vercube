import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { hash } from 'ohash';
import { CacheError } from '../Errors/CacheError';
import { CacheManager } from '../Services/CacheManager';
import type { CacheTypes } from '../Types/CacheTypes';

/**
 * Decorator implementation that replaces the decorated method with a cached
 * version of itself.
 *
 * The wrapper is built lazily on the first call so that storages mounted after
 * the container has been flushed - and defaults configured during bootstrap -
 * are still picked up.
 */
export class CacheDecorator extends BaseDecorator<CacheTypes.DecoratorOptions> {
  /** Cache manager owning the caching engine wiring */
  @Inject(CacheManager)
  protected gCacheManager!: CacheManager;

  /** The untouched method, kept so it can be restored on destroy */
  protected fOriginalMethod: ((...args: unknown[]) => unknown) | null = null;

  /** Whether the method lived on the instance itself rather than on the prototype */
  protected fOwnMethod: boolean = false;

  /**
   * Replaces the decorated method with its cached counterpart.
   *
   * @returns {void}
   */
  public override created(): void {
    const original = this.instance[this.propertyName];

    if (typeof original !== 'function') {
      throw new CacheError('@Cache() can only be applied to methods', 'decorate', undefined, {
        property: this.propertyName,
        received: typeof original,
      });
    }

    this.fOriginalMethod = original;
    this.fOwnMethod = Object.hasOwn(this.instance, this.propertyName);

    const owner = this.instance?.constructor?.name ?? 'anonymous';
    const options: CacheTypes.DecoratorOptions = {
      name: `${owner}.${this.propertyName}`,
      integrity: hash([original, this.options ?? {}]),
      ...this.options,
    };

    let cached: CacheTypes.CachedFunction | null = null;

    const resolveCached = (): CacheTypes.CachedFunction => {
      cached ??= this.gCacheManager.cached((...args: unknown[]) => original.apply(this.instance, args), options);
      return cached;
    };

    const wrapper = (...args: unknown[]): Promise<unknown> => resolveCached()(...args);

    wrapper.resolveKeys = (...args: unknown[]): Promise<string[]> => resolveCached().resolveKeys(...args);
    wrapper.invalidate = (...args: unknown[]): Promise<void> => resolveCached().invalidate(...args);
    wrapper.expire = (...args: unknown[]): Promise<void> => resolveCached().expire(...args);

    this.instance[this.propertyName] = wrapper;
  }

  /**
   * Drops the cached wrapper and puts the original method back in place.
   *
   * A method defined on the instance itself (a class field holding a function)
   * is written back, while a prototype method is simply uncovered by removing
   * the wrapper the decorator added to the instance.
   *
   * @returns {void}
   */
  public override destroyed(): void {
    if (!this.fOriginalMethod) {
      return;
    }

    if (this.fOwnMethod) {
      this.instance[this.propertyName] = this.fOriginalMethod;
    } else {
      delete this.instance[this.propertyName];
    }

    this.fOriginalMethod = null;
    this.fOwnMethod = false;
  }
}

/**
 * Caches the result of the decorated method.
 *
 * The cache key is derived from the method's arguments, so every distinct set of
 * arguments gets its own entry. Concurrent calls for the same key are coalesced
 * into a single execution, and entries are automatically dropped when the method
 * body or its cache options change.
 *
 * The decorated method gains three helpers, keyed exactly like the cached calls:
 * `resolveKeys(...args)`, `invalidate(...args)` and `expire(...args)`.
 *
 * @param {CacheTypes.DecoratorOptions} [options] - Cache options for this method
 * @returns {Function} The method decorator
 *
 * @example
 * ```ts
 * class UsersService {
 *   @Cache({ maxAge: 60, swr: true, staleMaxAge: 300, storage: 'redis' })
 *   public async getUser(id: string): Promise<User> {
 *     return this.database.findUser(id);
 *   }
 * }
 *
 * await usersService.getUser('123');
 * await (usersService.getUser as CacheTypes.CachedMethod<[string], User>).invalidate('123');
 * ```
 *
 * @example
 * ```ts
 * // arguments that are not safely hashable (Request, streams, class instances)
 * // should be projected into an explicit key
 * class ReportsController {
 *   @Cache({ maxAge: 300, getKey: (range: DateRange) => `${range.from}-${range.to}` })
 *   public async report(range: DateRange): Promise<Report> {
 *     return this.reports.build(range);
 *   }
 * }
 * ```
 */
export function Cache(options: CacheTypes.DecoratorOptions = {}): Function {
  return createDecorator(CacheDecorator, options);
}
