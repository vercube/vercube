import { AuthenticationProvider } from '@vercube/auth';

export class BasicAuthenticationProvider extends AuthenticationProvider {

  /**
	* Authenticates based on the HTTP event
	* @param request - The HTTP event containing the request
	* @returns An error string or Promise of error string, null or Promise of null if authentication is successful
	*/
  public authenticate(request: Request): null | string | Promise<string | null> {
    const [type, token] = (request.headers.get('Authorization') ?? '').split(' ');

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
