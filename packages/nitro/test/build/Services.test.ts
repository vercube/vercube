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

  it('should ignore export default that is not a class', () => {
    const code = `export default function handler() {}`;
    expect(extractServices(code)).toEqual([]);
  });

  it('should ignore export named that is not a class', () => {
    const code = `export const x = 1;`;
    expect(extractServices(code)).toEqual([]);
  });

  it('should ignore anonymous class without name', () => {
    const code = `@Injectable() export default class {}`;
    expect(extractServices(code)).toEqual([]);
  });

  it('should extract from non-exported class declaration', () => {
    const code = `
      @Injectable()
      class InternalService {
        do() {}
      }
    `;
    const services = extractServices(code);
    expect(services).toHaveLength(1);
    expect(services[0].importClassName).toBe('InternalService');
    expect(services[0].import).toContain('import { InternalService }');
  });

  it('should handle transformService with real file', async () => {
    const { writeFileSync, mkdirSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { transformService } = await import('../../src/build/Services');

    const dir = join(tmpdir(), `vercube-svc-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'UserService.ts');
    writeFileSync(filePath, `@Injectable() export class UserService { get() {} }`);

    try {
      const result = await transformService({ fullPath: filePath, path: 'UserService.ts' });
      expect(result).toHaveLength(1);
      expect(result[0].fullPath).toBe(filePath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
