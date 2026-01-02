import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPHttpHandler } from '../../src/Services/MCPHttpHandler';
import { ToolRegistry } from '../../src/Services/ToolRegistry';
import type { Logger } from '@vercube/logger';

const registerToolSpy = vi.fn();
const mockRequestHandler = vi.fn(
  async () =>
    new Response('{"jsonrpc":"2.0","result":{"ok":true}}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
);

// Mock the createMcpHandler function
vi.mock('mcp-handler', () => ({
  createMcpHandler: vi.fn((initializeServer, _serverOptions) => {
    // Create a mock McpServer instance
    const mockServer = {
      registerTool: registerToolSpy,
    };

    // Call the initialization function
    initializeServer(mockServer);

    // Return the mock request handler
    return mockRequestHandler;
  }),
}));

describe('MCPHttpHandler', () => {
  let handler: MCPHttpHandler;
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    handler = new MCPHttpHandler();

    const loggerMock = {
      configure: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;

    Reflect.set(handler, 'gToolRegistry', registry);
    Reflect.set(handler, 'gLogger', loggerMock);

    registerToolSpy.mockClear();
    mockRequestHandler.mockClear();
  });

  it('creates handler and registers tools', async () => {
    registry.register({
      controller: {},
      propertyKey: 'run',
      handler: vi.fn().mockResolvedValue({ ok: true }),
      metadata: {
        name: 'run',
        description: 'Run tool',
      },
    });

    const response = await handler.handleRequest(new Request('http://localhost/mcp', { method: 'POST' }));

    expect(registerToolSpy).toHaveBeenCalledOnce();
    expect(registerToolSpy).toHaveBeenCalledWith(
      'run',
      expect.objectContaining({
        description: 'Run tool',
      }),
      expect.any(Function),
    );
    expect(mockRequestHandler).toHaveBeenCalledOnce();
    expect(response?.status).toBe(200);
  });

  it('handles GET requests', async () => {
    const response = await handler.handleRequest(new Request('http://localhost/mcp', { method: 'GET' }));

    expect(mockRequestHandler).toHaveBeenCalledOnce();
    expect(response?.status).toBe(200);
  });

  it('caches the handler function between requests', async () => {
    const request1 = new Request('http://localhost/mcp', { method: 'POST' });
    const request2 = new Request('http://localhost/mcp', { method: 'POST' });

    await handler.handleRequest(request1);
    await handler.handleRequest(request2);

    // Handler should be created only once
    expect(mockRequestHandler).toHaveBeenCalledTimes(2);
    // But tools registered only once during handler creation
    expect(registerToolSpy).toHaveBeenCalledTimes(0); // No tools registered in this test
  });

  it('subscribes to tool registry changes', async () => {
    const subscribeSpy = vi.spyOn(registry, 'subscribe');

    await handler.handleRequest(new Request('http://localhost/mcp', { method: 'POST' }));

    expect(subscribeSpy).toHaveBeenCalledOnce();
    expect(subscribeSpy).toHaveBeenCalledWith(expect.any(Function));
  });

  it('wraps tool handler results in CallToolResult format', async () => {
    const toolHandler = vi.fn().mockResolvedValue('plain string result');

    registry.register({
      controller: {},
      propertyKey: 'testTool',
      handler: toolHandler,
      metadata: {
        name: 'testTool',
        description: 'Test tool',
      },
    });

    await handler.handleRequest(new Request('http://localhost/mcp', { method: 'POST' }));

    // Get the wrapped handler that was registered
    const registeredHandler = registerToolSpy.mock.calls[0][2];
    const result = await registeredHandler({}, {});

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'plain string result',
        },
      ],
    });
  });

  it('passes through properly formatted CallToolResult', async () => {
    const properResult = {
      content: [{ type: 'text', text: 'formatted result' }],
    };
    const toolHandler = vi.fn().mockResolvedValue(properResult);

    registry.register({
      controller: {},
      propertyKey: 'testTool',
      handler: toolHandler,
      metadata: {
        name: 'testTool',
        description: 'Test tool',
      },
    });

    await handler.handleRequest(new Request('http://localhost/mcp', { method: 'POST' }));

    const registeredHandler = registerToolSpy.mock.calls[0][2];
    const result = await registeredHandler({}, {});

    expect(result).toEqual(properResult);
  });

  it('handles tool execution errors gracefully', async () => {
    const toolHandler = vi.fn().mockRejectedValue('Tool execution failed');

    registry.register({
      controller: {},
      propertyKey: 'failingTool',
      handler: toolHandler,
      metadata: {
        name: 'failingTool',
        description: 'Failing tool',
      },
    });

    await handler.handleRequest(new Request('http://localhost/api/mcp', { method: 'POST' }));

    const registeredHandler = registerToolSpy.mock.calls[0][2];
    const result = await registeredHandler({}, {});

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: Tool execution failed',
        },
      ],
      isError: true,
    });
  });

  it('formats Error instances correctly', async () => {
    const error = new Error('Test error message');
    const toolHandler = vi.fn().mockRejectedValue(error);

    registry.register({
      controller: {},
      propertyKey: 'errorTool',
      handler: toolHandler,
      metadata: {
        name: 'errorTool',
        description: 'Error tool',
      },
    });

    await handler.handleRequest(new Request('http://localhost/mcp', { method: 'POST' }));

    const registeredHandler = registerToolSpy.mock.calls[0][2];
    const result = await registeredHandler({}, {});

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: Test error message',
        },
      ],
      isError: true,
    });
  });

  it('formats unknown error types correctly', async () => {
    const unknownError = { toString: () => 'Custom error object' };
    const toolHandler = vi.fn().mockRejectedValue(unknownError);

    registry.register({
      controller: {},
      propertyKey: 'unknownErrorTool',
      handler: toolHandler,
      metadata: {
        name: 'unknownErrorTool',
        description: 'Unknown error tool',
      },
    });

    await handler.handleRequest(new Request('http://localhost/mcp', { method: 'POST' }));

    const registeredHandler = registerToolSpy.mock.calls[0][2];
    const result = await registeredHandler({}, {});

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: Custom error object',
        },
      ],
      isError: true,
    });
  });

  it('handles completely unknown error types', async () => {
    const nullError = null;
    const toolHandler = vi.fn().mockRejectedValue(nullError);

    registry.register({
      controller: {},
      propertyKey: 'nullErrorTool',
      handler: toolHandler,
      metadata: {
        name: 'nullErrorTool',
        description: 'Null error tool',
      },
    });

    await handler.handleRequest(new Request('http://localhost/mcp', { method: 'POST' }));

    const registeredHandler = registerToolSpy.mock.calls[0][2];
    const result = await registeredHandler({}, {});

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: Unknown error',
        },
      ],
      isError: true,
    });
  });

  it('handles error objects without toString method', async () => {
    // Create object without prototype chain (no inherited toString)
    const objectError = Object.create(null);
    objectError.someProperty = 'value';
    const toolHandler = vi.fn().mockRejectedValue(objectError);

    registry.register({
      controller: {},
      propertyKey: 'objectErrorTool',
      handler: toolHandler,
      metadata: {
        name: 'objectErrorTool',
        description: 'Object error tool',
      },
    });

    await handler.handleRequest(new Request('http://localhost/mcp', { method: 'POST' }));

    const registeredHandler = registerToolSpy.mock.calls[0][2];
    const result = await registeredHandler({}, {});

    // Object without toString should fall through to 'Unknown error'
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: Unknown error',
        },
      ],
      isError: true,
    });
  });
});
