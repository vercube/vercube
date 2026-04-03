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

  it('should handle method decorator without arguments (non-call expression)', () => {
    const code = `
      @Controller('/api')
      export class FooController {
        @Get
        foo() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes).toHaveLength(0);
  });

  it('should use empty string as path when HTTP decorator has non-literal argument', () => {
    const code = `
      @Controller('/api')
      export class FooController {
        @Get(SOME_PATH)
        foo() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes).toHaveLength(1);
    expect(routes[0].route).toBe('/api');
  });

  it('should handle class with no decorators on class node', () => {
    const code = `
      @Controller('/api')
      export class FooController {}
    `;
    const routes = extractRoutes(code);
    expect(routes).toEqual([]);
  });

  it('should handle method with no decorators', () => {
    const code = `
      @Controller('/api')
      export class FooController {
        foo() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes).toEqual([]);
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

  it('should extract route from non-exported class declaration', () => {
    const code = `
      @Controller('/api')
      class InternalController {
        @Get('/internal')
        internal() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes).toHaveLength(1);
    expect(routes[0].route).toBe('/api/internal');
    expect(routes[0].import).toContain('import { InternalController }');
  });

  it('should handle @Controller decorator without string argument', () => {
    const code = `
      @Controller()
      export class FooController {
        @Get('/foo')
        foo() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes).toHaveLength(1);
    expect(routes[0].route).toBe('/foo');
  });

  it('should ignore export default that is not a class', () => {
    const code = `
      export default function handler() {}
    `;
    expect(extractRoutes(code)).toEqual([]);
  });

  it('should ignore export named that is not a class', () => {
    const code = `
      export const handler = () => {};
    `;
    expect(extractRoutes(code)).toEqual([]);
  });

  it('should handle @Controller with non-literal argument', () => {
    const code = `
      @Controller(BASE_PATH)
      export class FooController {
        @Get('/foo')
        foo() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes).toHaveLength(1);
    expect(routes[0].route).toBe('/foo');
  });

  it('should skip anonymous default-export class without a name', () => {
    const code = `
      @Controller('/api')
      export default class {
        @Get('/foo')
        foo() {}
      }
    `;
    expect(extractRoutes(code)).toEqual([]);
  });

  it('should skip non-MethodDefinition class members (e.g. property declarations)', () => {
    const code = `
      @Controller('/api')
      export class FooController {
        static path = '/api';
        @Get('/foo')
        foo() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes).toHaveLength(1);
    expect(routes[0].route).toBe('/api/foo');
  });

  it('should skip non-Controller class-level decorators when resolving the base path', () => {
    const code = `
      @Injectable()
      @Controller('/api')
      export class FooController {
        @Get('/foo')
        foo() {}
      }
    `;
    const routes = extractRoutes(code);
    expect(routes).toHaveLength(1);
    expect(routes[0].route).toBe('/api/foo');
  });

  it('should handle transformRoute with real file', async () => {
    const { writeFileSync, mkdirSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { transformRoute } = await import('../../src/build/Routes');

    const dir = join(tmpdir(), `vercube-route-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'FooController.ts');
    writeFileSync(filePath, `@Controller('/api') export class FooController { @Get('/foo') foo() {} }`);

    try {
      const routes = await transformRoute({ fullPath: filePath, path: 'FooController.ts' });
      expect(routes).toHaveLength(1);
      expect(routes[0].fullPath).toBe(filePath);
      expect(routes[0].path).toBe('FooController.ts');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
