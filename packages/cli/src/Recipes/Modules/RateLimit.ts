import { defineRecipe } from '../Apply';

const CONTROLLER = `import { Controller, Post } from '@vercube/core';
import { RateLimit } from '@vercube/ratelimit';

/**
 * Five attempts a minute per client address, then 429 with Retry-After.
 *
 * curl -i -X POST localhost:3000/api/login
 *
 * Behind a proxy or a load balancer, set \`rateLimit.trustProxy\` in
 * vercube.config.ts, or every client shares the proxy's address.
 */
@Controller('/api/login')
export default class LoginController {
  @Post('/')
  @RateLimit({ limit: 5, window: '1m' })
  public login(): { ok: true } {
    return { ok: true };
  }
}
`;

export const rateLimitRecipe = defineRecipe({
  id: 'ratelimit',
  label: 'Rate limit',
  hint: '@RateLimit() on routes, counters on a storage mount',
  // the counters live in a storage mount
  requires: ['storage'],
  apply: ({ project }) => {
    project.addDependencies({ '@vercube/ratelimit': 'latest', '@vercube/storage': 'latest' });
    project.addPlugin({ name: 'RateLimitPlugin', from: '@vercube/ratelimit' });
    project.createFile('src/controller/LoginController.ts', CONTROLLER);
    project.bind({ name: 'LoginController', from: '@/controller/LoginController', default: true });
  },
});
