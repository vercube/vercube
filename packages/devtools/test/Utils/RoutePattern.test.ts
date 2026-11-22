import { describe, expect, it } from 'vitest';
import { excludedRoutes, matchesRoutePattern } from '../../src/Utils/RoutePattern';
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

  it('ignores trailing slashes and surrounding blanks', () => {
    expect(matchesRoutePattern('  /users/  ', 'GET', '/users')).toBe(true);
    expect(matchesRoutePattern('/', 'GET', '/')).toBe(true);
  });

  it('does not take an unknown first word for a method', () => {
    expect(matchesRoutePattern('FETCH /users', 'GET', '/users')).toBe(false);
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
