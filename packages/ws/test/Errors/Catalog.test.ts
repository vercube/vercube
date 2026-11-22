import { BadRequestError } from '@vercube/core';
import { getErrorGuidance } from '@vercube/di';
import { describe, expect, it, vi } from 'vitest';
import { WebsocketService, WebsocketTypes } from '../../src';

const schema = { '~standard': { version: 1, vendor: 'test', validate: () => ({ issues: [] }) } } as any;

/** A service with the given validation provider and nothing else injected. */
function createService(provider: unknown): WebsocketService {
  const service = new WebsocketService();

  Object.defineProperty(service, 'gValidationProvider', { value: provider, writable: true });

  return service;
}

/** Sends one message through the service and returns the error the peer was told about. */
async function failedMessage(service: WebsocketService): Promise<unknown> {
  const emitError = vi.spyOn(service as any, 'emitError').mockImplementation(() => {});
  const peer = { id: '1', namespace: '/room', send: vi.fn() };
  const message = { text: () => JSON.stringify({ event: 'create', data: {} }) };

  await service['handleMessage'](peer as any, message as any);

  return emitError.mock.calls[0]?.[2];
}

describe('WsErrors', () => {
  it('describes a schema without a validation provider', () => {
    const service = createService(null);
    let error: unknown;

    try {
      service.registerHandler(WebsocketTypes.HandlerAction.MESSAGE, '/Room', { callback: vi.fn(), event: 'create', schema });
    } catch (error_) {
      error = error_;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).constructor).toBe(Error);
    expect((error as Error).message).toBe(
      'Message handler for event "create" in namespace "/room" has a validationSchema, but no ValidationProvider is registered.',
    );
    expect(getErrorGuidance(error)).toMatchObject({
      code: 'VERCUBE_WS_SCHEMA_WITHOUT_VALIDATION_PROVIDER',
      fix: expect.stringContaining('container.bind(ValidationProvider, StandardSchemaValidationProvider)'),
    });
  });

  it('describes a message that arrives when the provider is gone', async () => {
    const service = createService({ validate: vi.fn() });

    service.registerHandler(WebsocketTypes.HandlerAction.MESSAGE, '/room', { callback: vi.fn(), event: 'create', schema });
    Object.defineProperty(service, 'gValidationProvider', { value: null });

    const error = await failedMessage(service);

    expect((error as Error).constructor).toBe(Error);
    expect((error as Error).message).toBe('ValidationProvider is not registered');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_WS_VALIDATION_PROVIDER_MISSING');
  });

  it('keeps a validation failure a BadRequestError with its issues', async () => {
    const issues = [{ message: 'Expected number', path: ['n'] }];
    const service = createService({ validate: vi.fn().mockResolvedValue({ issues }) });

    service.registerHandler(WebsocketTypes.HandlerAction.MESSAGE, '/room', { callback: vi.fn(), event: 'create', schema });

    const error = (await failedMessage(service)) as BadRequestError;
    const plain = new BadRequestError('Websocket message validation error', issues);

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toBe('Websocket message validation error');
    expect(error.status).toBe(400);
    expect(error.name).toBe(plain.name);
    expect(error.errors).toBe(issues);
    expect(JSON.stringify(error)).toBe(JSON.stringify(plain));
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_WS_MESSAGE_INVALID');
  });
});
