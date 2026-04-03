import { describe, expect, it } from 'vitest';
import { extractMiddlewares, MIDDLEWARE_IMPORT_SOURCE } from '../../src/build/Middleware';

describe('extractMiddlewares', () => {
  it('should return empty array when no classes found', () => {
    const code = `
      const x = 1;
      function foo() {}
    `;
    expect(extractMiddlewares(code)).toEqual([]);
  });

  it('should return empty array for class that does not extend BaseMiddleware', () => {
    const code = `
      export class SomeClass extends OtherBase {
        handle() {}
      }
    `;
    expect(extractMiddlewares(code)).toEqual([]);
  });

  it('should return empty array for class without superclass', () => {
    const code = `
      export class SomeClass {
        handle() {}
      }
    `;
    expect(extractMiddlewares(code)).toEqual([]);
  });

  it('should extract a named export class extending BaseMiddleware', () => {
    const code = `
      export class AuthMiddleware extends BaseMiddleware {
        handle() {}
      }
    `;
    const middlewares = extractMiddlewares(code);
    expect(middlewares).toHaveLength(1);
    expect(middlewares[0]).toMatchObject({
      importClassName: 'AuthMiddleware',
      import: `import { AuthMiddleware } from '${MIDDLEWARE_IMPORT_SOURCE}';`,
    });
  });

  it('should extract a default export class extending BaseMiddleware', () => {
    const code = `
      export default class AuthMiddleware extends BaseMiddleware {
        handle() {}
      }
    `;
    const middlewares = extractMiddlewares(code);
    expect(middlewares).toHaveLength(1);
    expect(middlewares[0]).toMatchObject({
      importClassName: 'AuthMiddleware',
      import: `import AuthMiddleware from '${MIDDLEWARE_IMPORT_SOURCE}';`,
    });
  });

  it('should extract multiple middleware classes from a single file', () => {
    const code = `
      export class AuthMiddleware extends BaseMiddleware {
        handle() {}
      }

      export class LoggingMiddleware extends BaseMiddleware {
        handle() {}
      }
    `;
    const middlewares = extractMiddlewares(code);
    expect(middlewares).toHaveLength(2);
    expect(middlewares[0].importClassName).toBe('AuthMiddleware');
    expect(middlewares[1].importClassName).toBe('LoggingMiddleware');
  });

  it('should ignore classes extending other bases alongside BaseMiddleware classes', () => {
    const code = `
      export class NotMiddleware extends SomethingElse {
        foo() {}
      }

      export class RealMiddleware extends BaseMiddleware {
        handle() {}
      }
    `;
    const middlewares = extractMiddlewares(code);
    expect(middlewares).toHaveLength(1);
    expect(middlewares[0].importClassName).toBe('RealMiddleware');
  });

  it('should initialize fullPath and path as empty strings', () => {
    const code = `
      export class MyMiddleware extends BaseMiddleware {
        handle() {}
      }
    `;
    const middlewares = extractMiddlewares(code);
    expect(middlewares[0].fullPath).toBe('');
    expect(middlewares[0].path).toBe('');
  });
});
