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

vi.mock('rou3/compiler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('rou3/compiler')>();

  return {
    compileRouter: (context: never) => {
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
});
