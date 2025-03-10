import { AuthorizationProvider } from '@vercube/auth';
import { AuthorizationParameters } from '../Types/AuthorizationParameters';

/**
 * Example Dummy auth provider
 */
export class DummyAuthorizationProvider extends AuthorizationProvider<AuthorizationParameters> {
/**
	* Authenticates based on the HTTP event
	* @param request - The HTTP event containing the request
  * @param params - The parameters to authorize
	* @returns An error string or Promise of error string, null or Promise of null if authentication is successful
	*/
  public authorize(request: Request, params: AuthorizationParameters): string | null {
    if (params.role === 'admin') {
      return 'Only available to admins';
    }

    return null;
  }

}
