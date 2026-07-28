import { Container, initializeContainer } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { Storage, StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Cache, CacheDecorator, CacheError, CacheManager } from '../src';
import type { CacheTypes } from '../src';

const calls = {
  getUser: vi.fn(),
  listUsers: vi.fn(),
  report: vi.fn(),
  named: vi.fn(),
  secondary: vi.fn(),
};

class UsersService {
  @Cache({ maxAge: 60 })
  public async getUser(id: string): Promise<string> {
    calls.getUser(id);
    return `user-${id}`;
  }

  @Cache({ maxAge: 60 })
  public async listUsers(): Promise<string[]> {
    calls.listUsers();
    return ['a', 'b'];
  }

  @Cache({ maxAge: 60, getKey: (range: { from: string; to: string }) => `${range.from}:${range.to}` })
  public async report(range: { from: string; to: string; trace?: string }): Promise<string> {
    calls.report(range);
    return `${range.from}-${range.to}`;
  }

  @Cache({ name: 'custom-name', maxAge: 60 })
  public async named(): Promise<string> {
    calls.named();
    return 'named';
  }

  @Cache({ maxAge: 60, storage: 'secondary' })
  public async secondary(): Promise<string> {
    calls.secondary();
    return 'secondary';
  }
}

/** Second class declaring a method with the very same name, to prove keys do not collide */
class AccountsService {
  @Cache({ maxAge: 60 })
  public async getUser(id: string): Promise<string> {
    return `account-${id}`;
  }
}

describe('@Cache', () => {
  let container: Container;
  let storageManager: StorageManager;
  let usersService: UsersService;

  beforeEach(async () => {
    for (const spy of Object.values(calls)) {
      spy.mockClear();
    }

    container = new Container();

    container.bindInstance(Container, container);
    container.bindInstance(Logger, {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger);
    container.bind(StorageManager);
    container.bind(Storage);
    container.bind(MemoryStorage);
    container.bind(CacheManager);
    container.bind(UsersService);
    container.bind(AccountsService);
    initializeContainer(container);

    storageManager = container.get(StorageManager);
    await storageManager.mount({ storage: MemoryStorage });
    await storageManager.mount({ name: 'secondary', storage: MemoryStorage });

    usersService = container.get(UsersService);
  });

  describe('caching', () => {
    it('should call the method only once for the same arguments', async () => {
      await expect(usersService.getUser('1')).resolves.toBe('user-1');
      await expect(usersService.getUser('1')).resolves.toBe('user-1');

      expect(calls.getUser).toHaveBeenCalledOnce();
    });

    it('should keep a separate entry per argument set', async () => {
      await expect(usersService.getUser('1')).resolves.toBe('user-1');
      await expect(usersService.getUser('2')).resolves.toBe('user-2');
      await expect(usersService.getUser('1')).resolves.toBe('user-1');

      expect(calls.getUser).toHaveBeenCalledTimes(2);
    });

    it('should cache methods without arguments', async () => {
      await expect(usersService.listUsers()).resolves.toEqual(['a', 'b']);
      await expect(usersService.listUsers()).resolves.toEqual(['a', 'b']);

      expect(calls.listUsers).toHaveBeenCalledOnce();
    });

    it('should keep `this` bound to the owning instance', async () => {
      class Counter {
        private fBase = 10;

        @Cache({ maxAge: 60 })
        public async value(): Promise<number> {
          return this.fBase + 1;
        }
      }

      container.bind(Counter);
      container.expand(() => {});

      await expect(container.get(Counter).value()).resolves.toBe(11);
    });

    it('should share entries between two instances of the same class', async () => {
      // the key is built from the class name, the method name and the arguments -
      // instance identity is deliberately not part of it
      container.bind('UsersServiceAlias', UsersService);
      container.expand(() => {});

      const other = container.get<UsersService>('UsersServiceAlias');
      expect(other).not.toBe(usersService);

      await expect(usersService.getUser('1')).resolves.toBe('user-1');
      await expect(other.getUser('1')).resolves.toBe('user-1');

      expect(calls.getUser).toHaveBeenCalledOnce();
    });

    it('should not collide with a same-named method on another class', async () => {
      await expect(usersService.getUser('1')).resolves.toBe('user-1');
      await expect(container.get(AccountsService).getUser('1')).resolves.toBe('account-1');
    });

    it('should honour a custom key derivation', async () => {
      await usersService.report({ from: 'a', to: 'b', trace: '1' });
      await usersService.report({ from: 'a', to: 'b', trace: '2' });

      expect(calls.report).toHaveBeenCalledOnce();
    });
  });

  describe('keys', () => {
    it('should default the cache name to Class.method', async () => {
      await usersService.getUser('1');

      const keys = await storageManager.getKeys({});
      expect(keys.some((key) => key.startsWith('/cache:functions:UsersService.getUser:'))).toBe(true);
    });

    it('should use an explicit name when given', async () => {
      await usersService.named();

      const keys = await storageManager.getKeys({});
      expect(keys.some((key) => key.startsWith('/cache:functions:custom-name:'))).toBe(true);
    });

    it('should store entries in the requested storage', async () => {
      await usersService.secondary();

      await expect(storageManager.size({})).resolves.toBe(0);
      await expect(storageManager.size({ storage: 'secondary' })).resolves.toBe(1);
    });
  });

  describe('revalidation helpers', () => {
    it('should expose resolveKeys on the decorated method', async () => {
      const getUser = usersService.getUser as unknown as CacheTypes.CachedMethod<[string], string>;

      await usersService.getUser('1');
      const [key] = await getUser.resolveKeys('1');

      await expect(storageManager.hasItem({ key })).resolves.toBe(true);
    });

    it('should drop the entry through invalidate', async () => {
      const getUser = usersService.getUser as unknown as CacheTypes.CachedMethod<[string], string>;

      await usersService.getUser('1');
      await getUser.invalidate('1');
      await usersService.getUser('1');

      expect(calls.getUser).toHaveBeenCalledTimes(2);
    });

    it('should only invalidate the matching argument set', async () => {
      const getUser = usersService.getUser as unknown as CacheTypes.CachedMethod<[string], string>;

      await usersService.getUser('1');
      await usersService.getUser('2');
      await getUser.invalidate('1');
      await usersService.getUser('2');

      expect(calls.getUser).toHaveBeenCalledTimes(2);
    });

    it('should key the helpers through a custom getKey', async () => {
      const report = usersService.report as unknown as CacheTypes.CachedMethod<
        [{ from: string; to: string; trace?: string }],
        string
      >;

      await usersService.report({ from: 'a', to: 'b', trace: '1' });

      // the helper must project the key the same way the cached call did,
      // so a differing `trace` still resolves to the very same entry
      const [key] = await report.resolveKeys({ from: 'a', to: 'b', trace: '2' });
      await expect(storageManager.hasItem({ key })).resolves.toBe(true);

      await report.invalidate({ from: 'a', to: 'b', trace: '3' });
      await usersService.report({ from: 'a', to: 'b', trace: '4' });

      expect(calls.report).toHaveBeenCalledTimes(2);
    });

    it('should mark the entry stale through expire', async () => {
      const getUser = usersService.getUser as unknown as CacheTypes.CachedMethod<[string], string>;

      await usersService.getUser('1');
      await getUser.expire('1');
      await usersService.getUser('1');

      expect(calls.getUser).toHaveBeenCalledTimes(2);
    });
  });

  describe('integrity', () => {
    it('should drop entries written by a different method body', async () => {
      const getUser = usersService.getUser as unknown as CacheTypes.CachedMethod<[string], string>;
      const [key] = await getUser.resolveKeys('1');

      await storageManager.setItem({
        key,
        value: { value: 'stale-from-another-build', mtime: Date.now(), integrity: 'other-integrity' },
      });

      await expect(usersService.getUser('1')).resolves.toBe('user-1');
      expect(calls.getUser).toHaveBeenCalledOnce();
    });
  });

  describe('lifecycle', () => {
    it('should reject decorating a non-method property', () => {
      const decorator = container.resolve(CacheDecorator);
      decorator.options = {};
      decorator.instance = { notAMethod: 'nope' };
      decorator.propertyName = 'notAMethod';

      expect(() => decorator.created()).toThrow(CacheError);
    });

    it('should fall back to an anonymous owner when the instance has no constructor', async () => {
      const decorator = container.resolve(CacheDecorator);
      const instance = Object.create(null) as Record<string, unknown>;

      instance.value = async () => 'value';

      // options left unset on purpose - the decorator must cope with a missing options object
      decorator.instance = instance;
      decorator.propertyName = 'value';
      decorator.created();

      await (instance.value as () => Promise<string>)();

      const keys = await storageManager.getKeys({});
      expect(keys.some((key) => key.startsWith('/cache:functions:anonymous.value:'))).toBe(true);
    });

    it('should restore the original method on destroy', async () => {
      const decorator = container.resolve(CacheDecorator);
      const instance = new UsersService();

      decorator.options = { maxAge: 60 };
      decorator.instance = instance;
      decorator.propertyName = 'listUsers';

      decorator.created();
      expect(Object.hasOwn(instance, 'listUsers')).toBe(true);

      decorator.destroyed();
      expect(Object.hasOwn(instance, 'listUsers')).toBe(false);
    });

    it('should put back a method that lived on the instance itself', () => {
      const decorator = container.resolve(CacheDecorator);
      const original = async (): Promise<string> => 'own';
      const instance = { value: original };

      decorator.options = { maxAge: 60 };
      decorator.instance = instance;
      decorator.propertyName = 'value';

      decorator.created();
      expect(instance.value).not.toBe(original);

      // deleting would drop a class-field method entirely, so it is written back
      decorator.destroyed();
      expect(instance.value).toBe(original);
    });

    it('should be safe to destroy twice or without a preceding create', () => {
      const decorator = container.resolve(CacheDecorator);
      const instance = new UsersService();

      decorator.options = { maxAge: 60 };
      decorator.instance = instance;
      decorator.propertyName = 'listUsers';

      expect(() => decorator.destroyed()).not.toThrow();

      decorator.created();
      decorator.destroyed();

      expect(() => decorator.destroyed()).not.toThrow();
      expect(typeof instance.listUsers).toBe('function');
    });
  });
});
