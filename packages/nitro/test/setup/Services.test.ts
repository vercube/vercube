import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTransformedServices, scanServices } from '../../src/setup/Services';

function makeMockNitro(tmpDir: string) {
  return {
    options: { scanDirs: [tmpDir] },
    logger: { warn: vi.fn() },
  } as any;
}

const serviceCode = `
  @Injectable()
  export class UserService {
    getUser() {}
  }
`;

describe('scanServices', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vercube-services-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should scan from root when no scanDirs provided', async () => {
    writeFileSync(join(tmpDir, 'UserService.ts'), serviceCode);
    const nitro = makeMockNitro(tmpDir);
    const result = await scanServices(nitro);
    expect(result).toHaveLength(1);
  });

  it('should scan from custom scanDirs', async () => {
    const serviceDir = join(tmpDir, 'custom');
    mkdirSync(serviceDir);
    writeFileSync(join(serviceDir, 'MyService.ts'), serviceCode);

    const nitro = makeMockNitro(tmpDir);
    const result = await scanServices(nitro, ['custom']);
    expect(result).toHaveLength(1);
  });

  it('should return empty array when no files found', async () => {
    const nitro = makeMockNitro(tmpDir);
    const result = await scanServices(nitro);
    expect(result).toEqual([]);
  });
});

describe('getTransformedServices', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vercube-services-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return services with resolved import paths', async () => {
    const filePath = join(tmpDir, 'UserService.ts');
    writeFileSync(filePath, serviceCode);

    const nitro = makeMockNitro(tmpDir);
    const services = await getTransformedServices(nitro);
    expect(services).toHaveLength(1);
    expect(services[0].importClassName).toBe('UserService');
    expect(services[0].import).toContain(filePath);
  });

  it('should use scanDirs when provided', async () => {
    const subDir = join(tmpDir, 'services');
    mkdirSync(subDir);
    const filePath = join(subDir, 'PostService.ts');
    writeFileSync(filePath, `@Injectable() export class PostService {}`);

    const nitro = makeMockNitro(tmpDir);
    const services = await getTransformedServices(nitro, ['services']);
    expect(services).toHaveLength(1);
    expect(services[0].importClassName).toBe('PostService');
  });

  it('should return empty array when no injectable classes found', async () => {
    writeFileSync(join(tmpDir, 'plain.ts'), 'export class PlainClass {}');
    const nitro = makeMockNitro(tmpDir);
    const services = await getTransformedServices(nitro);
    expect(services).toEqual([]);
  });
});
