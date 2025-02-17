import { AuthorizationProvider } from '@vercube/auth';
import { HttpEvent } from '@vercube/core';
import { AuthorizationParameters } from '../Types/AuthorizationParameters';

export class DummyAuthorizationProvider extends AuthorizationProvider<AuthorizationParameters> {
  authorize(params: AuthorizationParameters, event: HttpEvent): string | null {
    if (params.role === 'admin') {
      return 'Only available to admins';
    }

    return null;
  }
}
