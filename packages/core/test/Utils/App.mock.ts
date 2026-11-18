import { Logger } from '@vercube/logger';
import { vi } from 'vitest';
import { createApp, ErrorHandlerProvider } from '../../src';
import { MockController } from './MockController.mock';
import type { CreateAppOptions } from '../../src';

export const createTestApp = async (params: CreateAppOptions = {}) => {
  const app = await createApp(params);

  app.container.expand((container) => {
    container.bind(MockController);
    container.bindMock(Logger, {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });
    container.bindMock(ErrorHandlerProvider, {
      // answers like the default handler would, so a bench of an error path measures a response
      handleError: vi.fn((error: Error) => new Response(null, { status: (error as { status?: number }).status ?? 500 })),
    });
  });

  return app;
};
