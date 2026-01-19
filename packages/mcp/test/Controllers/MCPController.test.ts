import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MCPHttpHandler } from '../../src/Services/MCPHttpHandler';
import { MCPController } from '../../src/Controllers/MCPController';

describe('MCPController', () => {
  let controller: MCPController;
  let handlerMock: MCPHttpHandler;

  beforeEach(() => {
    controller = new MCPController();
    handlerMock = {
      handleRequest: vi.fn(),
      destroy: vi.fn(),
    } as unknown as MCPHttpHandler;

    Reflect.set(controller, 'gHttpHandler', handlerMock);
  });

  it('returns response when handler resolves', async () => {
    const response = new Response('ok', { status: 200 });
    const handleRequestMock = handlerMock.handleRequest as unknown as ReturnType<typeof vi.fn>;
    handleRequestMock.mockResolvedValue(response);

    const result = await controller.handle(new Request('http://localhost/mcp'));

    expect(result).toBe(response);
    expect(handlerMock.handleRequest).toHaveBeenCalledWith(expect.any(Request));
  });

  it('throws NotFoundError when handler cannot resolve request', async () => {
    const handleRequestMock = handlerMock.handleRequest as unknown as ReturnType<typeof vi.fn>;
    handleRequestMock.mockResolvedValue(undefined);

    await expect(controller.handle(new Request('http://localhost/mcp/tool'))).rejects.toThrow('Route not found');
    expect(handlerMock.handleRequest).toHaveBeenCalledWith(expect.any(Request));
  });
});
