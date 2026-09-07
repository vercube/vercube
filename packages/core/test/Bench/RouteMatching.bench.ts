import { describe, test } from 'vitest';
import { Controller, createApp, Get } from '../../src';
import { Router } from '../../src/Services/Router/Router';

/**
 * A realistic route table rather than the handful a unit test needs: matching
 * cost grows with the number of registered routes, and a parameterised path is
 * the case that cannot be served from the static lookup map.
 */
const STATIC_PATHS = [
  '/account/preferences',
  '/articles/archive',
  '/billing/invoices',
  '/catalog/featured',
  '/checkout/summary',
  '/comments/recent',
  '/dashboard/activity',
  '/events/upcoming',
  '/files/shared',
  '/integrations/status',
  '/messages/unread',
  '/notifications/history',
  '/orders/tracking',
  '/products/recommended',
  '/reports/monthly',
  '/search/suggestions',
  '/sessions/active',
  '/teams/members',
  '/users/profile',
];

const PARAM_PATHS = [
  '/users/:id/profile',
  '/users/:id/settings',
  '/users/:id/notifications',
  '/users/:id/messages',
  '/users/:id/messages/:messageId',
  '/users/:id/messages/:messageId/replies',
  '/users/:id/messages/:messageId/attachments',
  '/users/:id/messages/:messageId/attachments/:attachmentId',
];

@Controller('/')
class RoutesController {
  @Get('/id/:id')
  public byId(): unknown {
    return null;
  }
}

const app = await createApp({
  cfg: { requestLogging: false, requestContext: false },
  setup: (instance) => instance.container.bind(RoutesController),
});

const router = app.container.get(Router);

for (const path of [...STATIC_PATHS, ...PARAM_PATHS]) {
  router.addRoute({ path, method: 'GET', handler: { instance: {}, propertyName: 'noop' } as never });
}

describe('[Bench] Route matching', () => {
  test('match - static path', async ({ bench }) => {
    await bench('match - static path', () => {
      router.match('GET', '/billing/invoices');
    }).run();
  });

  test('match - one parameter', async ({ bench }) => {
    await bench('match - one parameter', () => {
      router.match('GET', '/id/42');
    }).run();
  });

  test('match - three parameters, six segments', async ({ bench }) => {
    await bench('match - three parameters, six segments', () => {
      router.match('GET', '/users/42/messages/7/attachments/3');
    }).run();
  });
});
