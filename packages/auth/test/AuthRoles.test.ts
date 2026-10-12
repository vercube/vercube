import { Controller, Get } from '@vercube/core';
import { createTestApp } from '@vercube/testing';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { Auth } from '../src';
import { AuthProvider } from '../src/Services/AuthProvider';
import type { AuthTypes } from '../src/Types/AuthTypes';
import type { TestApp } from '@vercube/testing';

/**
 * Lets a request through when its `x-role` header is one of the required roles,
 * or when no roles are required.
 */
class RoleAuthProvider extends AuthProvider {
  public validate(request: Request, params?: AuthTypes.MiddlewareOptions): string | null {
    const roles = params?.roles ?? [];
    return roles.length === 0 || roles.includes(request.headers.get('x-role') ?? '') ? null : 'Missing role';
  }

  public getCurrentUser(): null {
    return null;
  }
}

@Controller('/roles')
@Auth()
class RolesController {
  @Get('/any')
  public any(): unknown {
    return { ok: true };
  }

  @Get('/admin')
  @Auth({ roles: ['admin'] })
  public admin(): unknown {
    return { ok: true };
  }
}

describe('[auth] roles on the controller and the method', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp({
      controllers: [RolesController],
      providers: [[AuthProvider, RoleAuthProvider]],
    });
  });

  afterAll(() => app.close());

  it('should apply the controller-level @Auth()', async () => {
    await app.get('/roles/any').header('x-role', 'user').expect(200);
  });

  it('should not drop the roles required by the method-level @Auth()', async () => {
    await app.get('/roles/admin').header('x-role', 'user').expect(401);
    await app.get('/roles/admin').header('x-role', 'admin').expect(200);
  });
});
