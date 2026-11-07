import { randomBytes } from 'node:crypto';
import { defineRecipe } from '../Apply';

/** The value \`.env.example\` shows for the key, refused by the provider. */
const PLACEHOLDER = 'change-me';

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
    const expected = process.env.API_KEY;
    const key = request.headers.get('x-api-key');

    // no key configured, or the placeholder from .env.example: nobody gets in
    if (!expected || expected === '${PLACEHOLDER}') {
      return null;
    }

    return key === expected ? { id: 'api', roles: ['admin'] } : null;
  }
}
`;

const CONTROLLER = `import { Auth, User } from '@vercube/auth';
import { Controller, Get } from '@vercube/core';
import type { ApiUser } from '@/services/ApiKeyAuthProvider';

/**
 * curl localhost:3000/api/profile -H "x-api-key: <API_KEY from .env>"
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
    // a key of its own for this project's .env, the placeholder in the committed example
    project.addEnv({ API_KEY: randomBytes(24).toString('base64url') }, 'Auth', { API_KEY: PLACEHOLDER });
  },
});
