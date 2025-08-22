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
      handleError: vi.fn(),
    });
  });

  return app;
};
