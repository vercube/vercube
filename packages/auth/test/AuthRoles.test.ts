import { Controller, createApp, Get } from '@vercube/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { Auth } from '../src';
import { AuthProvider } from '../src/Services/AuthProvider';
import type { AuthTypes } from '../src/Types/AuthTypes';
import type { App } from '@vercube/core';

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
  let app: App;

  beforeAll(async () => {
    app = await createApp({
      cfg: { requestLogging: false },
      setup: (instance) => {
        instance.container.bind(AuthProvider, RoleAuthProvider);
        instance.container.bind(RolesController);
      },
    });
  });

  const status = async (path: string, role: string) =>
    (await app.fetch(new Request(`http://localhost${path}`, { headers: { 'x-role': role } }))).status;

  it('should apply the controller-level @Auth()', async () => {
    expect(await status('/roles/any', 'user')).toBe(200);
  });

  it('should not drop the roles required by the method-level @Auth()', async () => {
    expect(await status('/roles/admin', 'user')).toBe(401);
    expect(await status('/roles/admin', 'admin')).toBe(200);
  });
});
