import { AuthenticationProvider } from '@vercube/auth';
import { HttpEvent } from '@vercube/core';

export class BasicAuthenticationProvider extends AuthenticationProvider {
  authenticate(event: HttpEvent): null | string | Promise<string | null> {
    const [type, token] = (event.headers.get('Authorization') ?? '').split(' ');

    if (type !== 'Basic') {
      return 'Invalid authentication method';
    }

    const [user, pass] = Buffer.from(token, 'base64').toString().split(':');

    if (user !== 'test' || pass !== 'test') {
      return 'Invalid username of password';
    }

    return null;
  }
}
