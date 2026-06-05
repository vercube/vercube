import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMiddlewares, getRoutes, getServices, scanProject, scanSource } from '../src/Project';

let baseDir: string;

beforeEach(() => {
  baseDir = join(tmpdir(), `vercube-scan-project-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(baseDir, { recursive: true });
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

/**
 * Writes a file at `<baseDir>/<sub>/<name>`, creating directories as needed.
 */
function write(sub: string, name: string, code: string): string {
  const dir = join(baseDir, sub);
  mkdirSync(dir, { recursive: true });
  const fullPath = join(dir, name);
  writeFileSync(fullPath, code);
  return fullPath;
}

describe('getRoutes', () => {
  it('discovers controllers in api and routes dirs with resolved imports', async () => {
    const apiFile = write(
      'api',
      'UserController.ts',
      `@Controller('/users') export class UserController { @Get('/:id') get() {} }`,
    );
    write('routes', 'HomeController.ts', `@Controller('/') export default class HomeController { @Post('/login') login() {} }`);

    const routes = await getRoutes({ baseDirs: [baseDir] });

    expect(routes).toHaveLength(2);

    const user = routes.find((r) => r.importClassName === 'UserController')!;
    expect(user.route).toBe('/users/:id');
    expect(user.method).toBe('GET');
    expect(user.params).toEqual(['id']);
    // import is resolved to the real file path (placeholder replaced)
    expect(user.import).toBe(`import { UserController } from '${apiFile}';`);

    const home = routes.find((r) => r.importClassName === 'HomeController')!;
    expect(home.route).toBe('/login');
    expect(home.import).toContain(`import HomeController from '`);
  });
});

describe('getServices', () => {
  it('discovers @Injectable services across default service dirs', async () => {
    write('services', 'MailService.ts', `@Injectable() export class MailService {}`);
    write('repositories', 'UserRepository.ts', `@Injectable() export default class UserRepository {}`);
    write('services', 'plain.ts', `export class NotAService {}`);

    const services = await getServices({ baseDirs: [baseDir] });

    expect(services.map((s) => s.importClassName).sort()).toEqual(['MailService', 'UserRepository']);
  });
});

describe('getMiddlewares', () => {
  it('discovers BaseMiddleware subclasses in the middleware dir', async () => {
    write('middleware', 'AuthMiddleware.ts', `export class AuthMiddleware extends BaseMiddleware { handle() {} }`);

    const middlewares = await getMiddlewares({ baseDirs: [baseDir] });

    expect(middlewares).toHaveLength(1);
    expect(middlewares[0].importClassName).toBe('AuthMiddleware');
  });
});

describe('scanProject', () => {
  it('aggregates routes/services/middleware and dedupes services already bound as routes', async () => {
    // A class that is both a controller and @Injectable should not be returned twice.
    write('api', 'UserController.ts', `@Injectable() @Controller('/users') export class UserController { @Get('/') list() {} }`);
    write('services', 'MailService.ts', `@Injectable() export class MailService {}`);
    write('middleware', 'AuthMiddleware.ts', `export class AuthMiddleware extends BaseMiddleware { handle() {} }`);

    const { routes, services, middlewares } = await scanProject({ baseDirs: [baseDir] });

    expect(routes.map((r) => r.importClassName)).toEqual(['UserController']);
    // UserController is filtered out of services because it is already a route
    expect(services.map((s) => s.importClassName)).toEqual(['MailService']);
    expect(middlewares.map((m) => m.importClassName)).toEqual(['AuthMiddleware']);
  });
});

describe('scanSource', () => {
  it('discovers every @Controller (including WebSocket-only ones) and dedupes services', async () => {
    // HTTP controller with routes.
    write('Controllers', 'UserController.ts', `@Controller('/users') export class UserController { @Get('/') list() {} }`);
    // WebSocket-only controller: @Controller + @Namespace, no HTTP method decorator.
    write(
      'Controllers',
      'ChatController.ts',
      `@Namespace('/chat') @Controller('/api/chat') export default class ChatController { @Message({ event: 'ping' }) ping() {} }`,
    );
    // A standalone injectable service.
    write('Services', 'MailService.ts', `@Injectable() export class MailService {}`);

    const { controllers, services } = await scanSource({ dirs: [baseDir] });

    expect(controllers.map((c) => c.importClassName).sort()).toEqual(['ChatController', 'UserController']);
    expect(services.map((s) => s.importClassName)).toEqual(['MailService']);
    // default vs named export styles are preserved in the generated imports
    expect(controllers.find((c) => c.importClassName === 'ChatController')!.import).toContain('import ChatController from');
    expect(controllers.find((c) => c.importClassName === 'UserController')!.import).toContain('import { UserController }');
  });

  it('discovers middleware classes anywhere in the scan tree', async () => {
    write('Middleware', 'AuthMiddleware.ts', `export class AuthMiddleware extends BaseMiddleware { handle() {} }`);

    const { middlewares } = await scanSource({ dirs: [baseDir] });

    expect(middlewares.map((m) => m.importClassName)).toEqual(['AuthMiddleware']);
    expect(middlewares[0].import).toContain(`import { AuthMiddleware } from '`);
  });
});
