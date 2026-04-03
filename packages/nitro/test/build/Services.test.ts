import { describe, expect, it } from 'vitest';
import { extractServices, SERVICE_IMPORT_SOURCE } from '../../src/build/Services';

describe('extractServices', () => {
  it('should return empty array when no classes found', () => {
    const code = `
      const x = 1;
      function foo() {}
    `;
    expect(extractServices(code)).toEqual([]);
  });

  it('should return empty array for class without @Injectable decorator', () => {
    const code = `
      export class SomeService {
        doSomething() {}
      }
    `;
    expect(extractServices(code)).toEqual([]);
  });

  it('should return empty array for class with different decorator', () => {
    const code = `
      @Controller('/foo')
      export class SomeService {
        doSomething() {}
      }
    `;
    expect(extractServices(code)).toEqual([]);
  });

  it('should extract a named export class with @Injectable()', () => {
    const code = `
      @Injectable()
      export class UserService {
        getUser() {}
      }
    `;
    const services = extractServices(code);
    expect(services).toHaveLength(1);
    expect(services[0]).toMatchObject({
      importClassName: 'UserService',
      import: `import { UserService } from '${SERVICE_IMPORT_SOURCE}';`,
    });
  });

  it('should extract a default export class with @Injectable()', () => {
    const code = `
      @Injectable()
      export default class UserService {
        getUser() {}
      }
    `;
    const services = extractServices(code);
    expect(services).toHaveLength(1);
    expect(services[0]).toMatchObject({
      importClassName: 'UserService',
      import: `import UserService from '${SERVICE_IMPORT_SOURCE}';`,
    });
  });

  it('should extract multiple service classes from a single file', () => {
    const code = `
      @Injectable()
      export class UserService {
        getUser() {}
      }

      @Injectable()
      export class PostService {
        getPosts() {}
      }
    `;
    const services = extractServices(code);
    expect(services).toHaveLength(2);
    expect(services[0].importClassName).toBe('UserService');
    expect(services[1].importClassName).toBe('PostService');
  });

  it('should ignore non-injectable classes alongside injectable ones', () => {
    const code = `
      export class NotAService {
        foo() {}
      }

      @Injectable()
      export class RealService {
        bar() {}
      }
    `;
    const services = extractServices(code);
    expect(services).toHaveLength(1);
    expect(services[0].importClassName).toBe('RealService');
  });

  it('should support @Injectable identifier style (without call)', () => {
    const code = `
      @Injectable
      export class UserService {
        getUser() {}
      }
    `;
    const services = extractServices(code);
    expect(services).toHaveLength(1);
    expect(services[0].importClassName).toBe('UserService');
  });

  it('should initialize fullPath and path as empty strings', () => {
    const code = `
      @Injectable()
      export class MyService {
        do() {}
      }
    `;
    const services = extractServices(code);
    expect(services[0].fullPath).toBe('');
    expect(services[0].path).toBe('');
  });
});
