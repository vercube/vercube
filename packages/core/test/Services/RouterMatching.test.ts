import { Container } from '@vercube/di';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HooksService } from '../../src/Services/Hooks/HooksService';
import { Router } from '../../src/Services/Router/Router';
import type { RouterTypes } from '../../src/Types/RouterTypes';

/**
 * Matching against a real rou3, unlike `Router.test.ts` which mocks it away:
 * the compiled matcher and the trie fallback can only be told apart when the
 * router underneath is the real one.
 */
let compilationFails = false;
let compileAttempts = 0;

vi.mock('rou3/compiler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('rou3/compiler')>();

  return {
    compileRouter: (context: never) => {
      compileAttempts++;

      // Stands in for a runtime that refuses `new Function`, which is what a
      // strict content security policy does.
      if (compilationFails) {
        throw new Error('Code generation from strings disallowed for this context');
      }

      return actual.compileRouter(context);
    },
  };
});

describe('Router matching', () => {
  let router: Router;

  const handlerFor = (name: string): RouterTypes.RouterHandler =>
    ({ instance: {}, propertyName: name }) as RouterTypes.RouterHandler;

  beforeEach(() => {
    compilationFails = false;
    compileAttempts = 0;

    const container = new Container();
    container.bindMock(HooksService, { trigger: vi.fn() });
    container.bind(Router);

    router = container.get(Router);
    router.initialize();

    router.addRoute({ method: 'GET', path: '/plain', handler: handlerFor('plain') });
    router.addRoute({ method: 'GET', path: '/id/:id', handler: handlerFor('byId') });
    router.addRoute({ method: 'GET', path: '/users/:id/messages/:messageId', handler: handlerFor('message') });
    router.addRoute({ method: 'POST', path: '/id/:id', handler: handlerFor('update') });
  });

  it('should match a static route', () => {
    expect(router.match('GET', '/plain')?.data.propertyName).toBe('plain');
  });

  it('should match a parameterised route and expose its parameters', () => {
    const matched = router.match('GET', '/id/42');

    expect(matched?.data.propertyName).toBe('byId');
    expect(matched?.params).toEqual({ id: '42' });
  });

  it('should match several parameters in one path', () => {
    const matched = router.match('GET', '/users/7/messages/9');

    expect(matched?.data.propertyName).toBe('message');
    expect(matched?.params).toEqual({ id: '7', messageId: '9' });
  });

  it('should distinguish methods on the same path', () => {
    expect(router.match('GET', '/id/42')?.data.propertyName).toBe('byId');
    expect(router.match('POST', '/id/42')?.data.propertyName).toBe('update');
  });

  it('should return undefined for a path nothing is registered under', () => {
    expect(router.match('GET', '/nothing/here')).toBeUndefined();
    expect(router.match('DELETE', '/id/42')).toBeUndefined();
  });

  it('should reuse the compiled matcher across requests', () => {
    // The second call takes the cached branch, which is the whole point of
    // compiling once rather than per request.
    expect(router.match('GET', '/id/1')?.params).toEqual({ id: '1' });
    expect(router.match('GET', '/id/2')?.params).toEqual({ id: '2' });
    expect(router.match('GET', '/id/3')?.params).toEqual({ id: '3' });
  });

  it('should pick up a route registered after the first match', () => {
    expect(router.match('GET', '/late/1')).toBeUndefined();

    router.addRoute({ method: 'GET', path: '/late/:id', handler: handlerFor('late') });

    const matched = router.match('GET', '/late/1');

    expect(matched?.data.propertyName).toBe('late');
    expect(matched?.params).toEqual({ id: '1' });
  });

  it('should fall back to the trie when the runtime refuses to compile', () => {
    compilationFails = true;

    const matched = router.match('GET', '/id/42');

    expect(matched?.data.propertyName).toBe('byId');
    expect(matched?.params).toEqual({ id: '42' });
  });

  it('should keep serving from the trie once compilation has failed', () => {
    compilationFails = true;

    expect(router.match('GET', '/id/1')?.params).toEqual({ id: '1' });
    expect(router.match('GET', '/users/1/messages/2')?.params).toEqual({ id: '1', messageId: '2' });
    expect(router.match('GET', '/nothing')).toBeUndefined();
  });

  it('should stop attempting to compile once the runtime has refused', () => {
    compilationFails = true;

    router.match('GET', '/id/1');
    const afterRefusal = compileAttempts;

    expect(afterRefusal).toBeGreaterThan(0);

    // A route registered after a refusal must not make the router try, and
    // fail, all over again.
    router.addRoute({ method: 'GET', path: '/after/:id', handler: handlerFor('after') });

    expect(router.match('GET', '/after/9')?.params).toEqual({ id: '9' });
    expect(router.match('GET', '/id/2')?.params).toEqual({ id: '2' });
    expect(compileAttempts).toBe(afterRefusal);
  });

  it('should compile once and reuse it until the route table changes', () => {
    router.match('GET', '/id/1');
    router.match('GET', '/id/2');

    expect(compileAttempts).toBe(1);

    router.addRoute({ method: 'GET', path: '/fresh/:id', handler: handlerFor('fresh') });

    expect(router.match('GET', '/fresh/1')?.params).toEqual({ id: '1' });
    expect(compileAttempts).toBe(2);
  });

  it('should agree with the trie on every registered route', () => {
    const paths: Array<[string, string]> = [
      ['GET', '/plain'],
      ['GET', '/id/42'],
      ['GET', '/users/7/messages/9'],
      ['POST', '/id/42'],
      ['GET', '/nothing'],
    ];

    const compiled = paths.map(([method, path]) => router.match(method, path));

    compilationFails = true;
    router.addRoute({ method: 'GET', path: '/force-recompile', handler: handlerFor('force') });

    const fromTrie = paths.map(([method, path]) => router.match(method, path));

    expect(fromTrie.map((route) => route?.data.propertyName)).toEqual(compiled.map((route) => route?.data.propertyName));
    expect(fromTrie.map((route) => route?.params)).toEqual(compiled.map((route) => route?.params));
  });

  describe('with static and parameterised routes on the same prefix', () => {
    beforeEach(() => {
      router.addRoute({ method: 'GET', path: '/users/profile', handler: handlerFor('profile') });
      router.addRoute({ method: 'GET', path: '/users/:id', handler: handlerFor('user') });
      router.addRoute({ method: 'GET', path: '/files/**', handler: handlerFor('files') });
      router.addRoute({ method: 'GET', path: '/opt/:id?', handler: handlerFor('optional') });
    });

    it('should prefer the static route over the parameterised one', () => {
      expect(router.match('GET', '/users/profile')?.data.propertyName).toBe('profile');
      expect(router.match('GET', '/users/profile')?.params).toBeUndefined();
    });

    it('should still match the parameterised route for any other segment', () => {
      const matched = router.match('GET', '/users/42');

      expect(matched?.data.propertyName).toBe('user');
      expect(matched?.params).toEqual({ id: '42' });
    });

    it('should match a wildcard route across several segments', () => {
      expect(router.match('GET', '/files/a/b/c')?.data.propertyName).toBe('files');
    });

    it('should match an optional parameter both with and without the segment', () => {
      // `/opt/:id?` registers on two nodes, and neither of them is in the
      // static lookup map, so both have to come from the parameterised router.
      expect(router.match('GET', '/opt')?.data.propertyName).toBe('optional');
      expect(router.match('GET', '/opt/7')?.params).toEqual({ id: '7' });
    });

    it('should not answer a static path under a method it was not registered for', () => {
      expect(router.match('POST', '/users/profile')).toBeUndefined();
      expect(router.match('POST', '/plain')).toBeUndefined();
    });

    it('should normalise a trailing slash on a static path', () => {
      expect(router.match('GET', '/users/profile/')?.data.propertyName).toBe('profile');
      expect(router.match('GET', '/plain/')?.data.propertyName).toBe('plain');
    });

    it('should agree with a router that keeps every route in one tree', () => {
      // The parameterised router only carries routes with parameters, so this
      // pins that dropping the static ones from it changes no answer.
      const paths: Array<[string, string]> = [
        ['GET', '/plain'],
        ['GET', '/users/profile'],
        ['GET', '/users/42'],
        ['GET', '/files/a/b'],
        ['GET', '/opt'],
        ['GET', '/opt/7'],
        ['GET', '/id/9'],
        ['GET', '/nothing'],
        ['POST', '/users/profile'],
      ];

      const viaCompiled = paths.map(([method, path]) => router.match(method, path));

      compilationFails = true;
      router.addRoute({ method: 'GET', path: '/force/:recompile', handler: handlerFor('force') });

      const viaTrie = paths.map(([method, path]) => router.match(method, path));

      expect(viaTrie.map((route) => route?.data.propertyName)).toEqual(viaCompiled.map((route) => route?.data.propertyName));
      expect(viaTrie.map((route) => route?.params)).toEqual(viaCompiled.map((route) => route?.params));
    });
  });
});
