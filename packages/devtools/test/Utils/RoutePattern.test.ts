import { describe, expect, it } from 'vitest';
import { excludedRoutes, matchesRoutePattern, parseRoutePattern } from '../../src/Utils/RoutePattern';
import type { IntrospectionTypes } from '@vercube/core';

/**
 * Builds the part of a route description the matcher reads.
 *
 * @param method - HTTP method
 * @param path - Route template
 * @returns The description
 */
function route(method: string, path: string): IntrospectionTypes.RouteDescription {
  return { id: `${method} ${path}`, method, path } as IntrospectionTypes.RouteDescription;
}

describe('matchesRoutePattern', () => {
  it('matches a template exactly, whatever the method', () => {
    expect(matchesRoutePattern('/users/:id', 'GET', '/users/:id')).toBe(true);
    expect(matchesRoutePattern('/users/:id', 'DELETE', '/users/:id')).toBe(true);
    expect(matchesRoutePattern('/users/:id', 'GET', '/users')).toBe(false);
    expect(matchesRoutePattern('/users', 'GET', '/users/:id')).toBe(false);
  });

  it('narrows to one method when the pattern names it', () => {
    expect(matchesRoutePattern('DELETE /users/:id', 'DELETE', '/users/:id')).toBe(true);
    expect(matchesRoutePattern('delete /users/:id', 'DELETE', '/users/:id')).toBe(true);
    expect(matchesRoutePattern('DELETE /users/:id', 'GET', '/users/:id')).toBe(false);
  });

  it('lets * stand for one segment', () => {
    expect(matchesRoutePattern('/users/*', 'GET', '/users/:id')).toBe(true);
    expect(matchesRoutePattern('/users/*', 'GET', '/users/:id/posts')).toBe(false);
    expect(matchesRoutePattern('/users/*', 'GET', '/users')).toBe(false);
  });

  it('lets ** stand for any number of segments, none included', () => {
    expect(matchesRoutePattern('/admin/**', 'GET', '/admin')).toBe(true);
    expect(matchesRoutePattern('/admin/**', 'POST', '/admin/users/:id')).toBe(true);
    expect(matchesRoutePattern('/admin/**', 'GET', '/administrators')).toBe(false);
    expect(matchesRoutePattern('/**', 'GET', '/')).toBe(true);
  });

  it('lets ** stand in the middle of a pattern without covering everything', () => {
    expect(matchesRoutePattern('/**/refund', 'POST', '/refund')).toBe(true);
    expect(matchesRoutePattern('/**/refund', 'POST', '/orders/:id/refund')).toBe(true);
    expect(matchesRoutePattern('/**/refund', 'GET', '/orders/:id')).toBe(false);
    expect(matchesRoutePattern('/**/refund', 'GET', '/')).toBe(false);
    expect(matchesRoutePattern('/**/refund', 'GET', '/refunds')).toBe(false);
    expect(matchesRoutePattern('/orders/**/items/*', 'GET', '/orders/items/:item')).toBe(true);
    expect(matchesRoutePattern('/orders/**/items/*', 'GET', '/orders/:id/boxes/:box/items/:item')).toBe(true);
    expect(matchesRoutePattern('/orders/**/items/*', 'GET', '/orders/:id/items')).toBe(false);
    expect(matchesRoutePattern('/**/admin/**', 'GET', '/v1/admin')).toBe(true);
    expect(matchesRoutePattern('/**/admin/**', 'GET', '/v1/users')).toBe(false);
  });

  it('takes a method alone for every route of that method', () => {
    expect(matchesRoutePattern('DELETE', 'DELETE', '/users/:id')).toBe(true);
    expect(matchesRoutePattern(' delete ', 'DELETE', '/')).toBe(true);
    expect(matchesRoutePattern('DELETE', 'GET', '/users/:id')).toBe(false);
  });

  it('matches a route that answers two methods by either', () => {
    expect(matchesRoutePattern('GET /users', 'GET / HEAD', '/users')).toBe(true);
    expect(matchesRoutePattern('HEAD /users', 'GET / HEAD', '/users')).toBe(true);
    expect(matchesRoutePattern('HEAD', 'GET / HEAD', '/users')).toBe(true);
    expect(matchesRoutePattern('POST /users', 'GET / HEAD', '/users')).toBe(false);
  });

  it('covers nothing with a pattern that cannot be read', () => {
    expect(matchesRoutePattern('admin/**', 'GET', '/admin/stats')).toBe(false);
    expect(matchesRoutePattern('GET admin', 'GET', '/admin')).toBe(false);
    expect(matchesRoutePattern('', 'GET', '/')).toBe(false);
  });

  it('ignores trailing slashes and surrounding blanks', () => {
    expect(matchesRoutePattern('  /users/  ', 'GET', '/users')).toBe(true);
    expect(matchesRoutePattern('/', 'GET', '/')).toBe(true);
  });

  it('does not take an unknown first word for a method', () => {
    expect(matchesRoutePattern('FETCH /users', 'GET', '/users')).toBe(false);
  });
});

describe('parseRoutePattern', () => {
  it('reads a template, a method with a template, and a method alone', () => {
    expect(parseRoutePattern('/admin/**')).toEqual({ segments: ['', 'admin', '**'] });
    expect(parseRoutePattern('  delete   /users/:id/ ')).toEqual({ method: 'DELETE', segments: ['', 'users', ':id'] });
    expect(parseRoutePattern('patch')).toEqual({ method: 'PATCH' });
  });

  it('refuses a template without a leading slash and says how to write one', () => {
    expect(() => parseRoutePattern('admin/**')).toThrow(
      'Invalid route pattern "admin/**": write a route template that starts with "/"',
    );
    expect(() => parseRoutePattern('DELETE users/:id')).toThrow('Invalid route pattern "DELETE users/:id"');
    expect(() => parseRoutePattern('GET /a /b')).toThrow('Invalid route pattern');
    expect(() => parseRoutePattern('   ')).toThrow('Invalid route pattern');
  });

  it('refuses a first word that is not a method', () => {
    expect(() => parseRoutePattern('FETCH /users')).toThrow('"FETCH" is not an HTTP method');
  });
});

describe('excludedRoutes', () => {
  const routes = [
    route('GET', '/users/:id'),
    route('DELETE', '/users/:id'),
    route('GET', '/admin/stats'),
    route('GET', '/_devtools/api/overview'),
    route('GET', '/_devtoolsish'),
  ];

  it('always leaves out the devtools routes', () => {
    expect(excludedRoutes(routes, [], '/_devtools')).toEqual(['GET /_devtools/api/overview']);
  });

  it('adds the routes the patterns cover', () => {
    expect(excludedRoutes(routes, ['DELETE /users/:id', '/admin/**'], '/_devtools')).toEqual([
      'DELETE /users/:id',
      'GET /admin/stats',
      'GET /_devtools/api/overview',
    ]);
  });
});
