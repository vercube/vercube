import { AuthorizationProvider } from '@vercube/auth';
import { HttpEvent } from '@vercube/core';

export class DummyAuthorizationProvider extends AuthorizationProvider<{ role: 'admin' | 'user' }> {
  authorize(params: { role: 'admin' | 'user' }, event: HttpEvent): string | null {
    if (params.role === 'admin') {
      return 'Only available to admins';
    }

    return null;
  }
}
