import { defineRecipe } from '../Apply';

const PROVIDER = `import { AuthProvider } from '@vercube/auth';
import type { AuthTypes } from '@vercube/auth';

export interface ApiUser {
  id: string;
  roles: string[];
}

/**
 * Lets a request in when its \`x-api-key\` header matches API_KEY. Replace it
 * with your own: a session, a JWT, an identity provider.
 */
export class ApiKeyAuthProvider extends AuthProvider<ApiUser> {
  public validate(request: Request, params?: AuthTypes.MiddlewareOptions): AuthTypes.ValidationResult<ApiUser> {
    const user = this.getCurrentUser(request);

    if (!user) {
      return { error: 'Invalid or missing API key' };
    }

    if (params?.roles?.length && !params.roles.some((role) => user.roles.includes(role))) {
      return { error: 'Insufficient permissions' };
    }

    return { user };
  }

  public getCurrentUser(request: Request): ApiUser | null {
    const key = request.headers.get('x-api-key');

    return key && key === process.env.API_KEY ? { id: 'api', roles: ['admin'] } : null;
  }
}
`;

const CONTROLLER = `import { Auth, User } from '@vercube/auth';
import { Controller, Get } from '@vercube/core';
import type { ApiUser } from '@/services/ApiKeyAuthProvider';

/**
 * curl localhost:3000/api/profile -H "x-api-key: $API_KEY"
 */
@Controller('/api/profile')
export default class ProfileController {
  @Get('/')
  @Auth()
  public async me(@User() user: ApiUser): Promise<{ user: ApiUser }> {
    return { user };
  }
}
`;

export const authRecipe = defineRecipe({
  id: 'auth',
  label: 'Auth',
  hint: 'secured routes',
  apply: ({ project }) => {
    project.addDependencies({ '@vercube/auth': 'latest' });
    project.createFile('src/services/ApiKeyAuthProvider.ts', PROVIDER);
    project.createFile('src/controller/ProfileController.ts', CONTROLLER);
    project.addToContainer('container.bind(AuthProvider, ApiKeyAuthProvider);', {
      AuthProvider: '@vercube/auth',
      ApiKeyAuthProvider: '@/services/ApiKeyAuthProvider',
    });
    project.bind({ name: 'ProfileController', from: '@/controller/ProfileController', default: true });
    project.addEnv({ API_KEY: 'change-me' }, 'Auth');
  },
});
