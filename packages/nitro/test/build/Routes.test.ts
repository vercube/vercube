import { describe, expect, it } from 'vitest';
import { extractRoutes, IMPORT_SOURCE } from '../../src/build/Routes';

describe('extractRoutes', () => {
  it('should return empty array when no classes found', () => {
    const code = `
      const x = 1;
      function foo() {}
    `;
    expect(extractRoutes(code)).toEqual([]);
  });

  it('should return empty array for class without @Controller decorator', () => {
    const code = `
      export class FooController {
        @Get('/foo')
        foo() {}
      }
    `;
    expect(extractRoutes(code)).toEqual([]);
  });

  it('should extract a simple GET route from named export class', () => {
    const code = `
      @Controller('/api')
      export class FooController {
        @Get('/foo')
        foo() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      route: '/api/foo',
      method: 'GET',
      importClassName: 'FooController',
      import: `import { FooController } from '${IMPORT_SOURCE}';`,
      params: [],
    });
  });

  it('should extract a route from default export class', () => {
    const code = `
      @Controller('/api')
      export default class FooController {
        @Post('/bar')
        bar() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      route: '/api/bar',
      method: 'POST',
      importClassName: 'FooController',
      import: `import FooController from '${IMPORT_SOURCE}';`,
      params: [],
    });
  });

  it('should extract multiple routes from single controller', () => {
    const code = `
      @Controller('/users')
      export class UserController {
        @Get('/')
        list() {}

        @Post('/')
        create() {}

        @Put('/:id')
        update() {}

        @Delete('/:id')
        remove() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes).toHaveLength(4);
    expect(routes[0]).toMatchObject({ route: '/users', method: 'GET' });
    expect(routes[1]).toMatchObject({ route: '/users', method: 'POST' });
    expect(routes[2]).toMatchObject({ route: '/users/:id', method: 'PUT' });
    expect(routes[3]).toMatchObject({ route: '/users/:id', method: 'DELETE' });
  });

  it('should support all HTTP methods', () => {
    const code = `
      @Controller('/test')
      export class TestController {
        @Get('/get') g() {}
        @Post('/post') p() {}
        @Put('/put') pu() {}
        @Delete('/delete') d() {}
        @Patch('/patch') pa() {}
        @Options('/options') o() {}
        @Head('/head') h() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes).toHaveLength(7);
    const methods = routes.map((r) => r.method);
    expect(methods).toEqual(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']);
  });

  it('should extract route params from path', () => {
    const code = `
      @Controller('/api')
      export class FooController {
        @Get('/users/:id/posts/:postId')
        getPost() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes[0].params).toEqual(['id', 'postId']);
  });

  it('should normalize duplicate slashes in paths', () => {
    const code = `
      @Controller('/api/')
      export class FooController {
        @Get('/foo')
        foo() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes[0].route).toBe('/api/foo');
  });

  it('should handle @Controller with empty path', () => {
    const code = `
      @Controller('')
      export class RootController {
        @Get('/health')
        health() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes[0].route).toBe('/health');
  });

  it('should handle method with empty path', () => {
    const code = `
      @Controller('/api')
      export class FooController {
        @Get('')
        root() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes[0].route).toBe('/api');
  });

  it('should extract routes from multiple controllers in the same file', () => {
    const code = `
      @Controller('/a')
      export class AController {
        @Get('/x')
        x() {}
      }

      @Controller('/b')
      export class BController {
        @Post('/y')
        y() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({ route: '/a/x', method: 'GET', importClassName: 'AController' });
    expect(routes[1]).toMatchObject({ route: '/b/y', method: 'POST', importClassName: 'BController' });
  });

  it('should ignore methods without HTTP decorators', () => {
    const code = `
      @Controller('/api')
      export class FooController {
        @Get('/foo')
        foo() {}

        helper() {}

        @SomeOtherDecorator()
        other() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes).toHaveLength(1);
    expect(routes[0].route).toBe('/api/foo');
  });
});
