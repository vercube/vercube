<div align="center">
  <a href="https://vercube.dev/"><img src="https://github.com/OskarLebuda/vue-lazy-hydration/raw/main/.github/assets/logo.png?raw=true" alt="Vercube logo" width="200"></a>
  <br>
  <br>

# Vercube

Next generation HTTP framework

  <a href="https://www.npmjs.com/package/@vercube/mcp">
    <img src="https://img.shields.io/npm/v/%40vercube%2Fmcp?style=for-the-badge&logo=npm&color=%23767eff" alt="npm"/>
  </a>
  <a href="https://www.npmjs.com/package/@vercube/mcp">
    <img src="https://img.shields.io/npm/dm/%40vercube%2Fmcp?style=for-the-badge&logo=npm&color=%23767eff" alt="npm"/>
  </a>
  <a href="https://github.com/vercube/vercube/blob/main/LICENSE" target="_blank">
    <img src="https://img.shields.io/npm/l/%40vercube%2Fmcp?style=for-the-badge&color=%23767eff" alt="License"/>
  </a>
  <a href="https://codecov.io/gh/vercube/vercube" target="_blank">
    <img src="https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&color=%23767eff" alt="Coverage"/>
  </a>
  <br/>
  <br/>
</div>

An ultra-efficient JavaScript server framework that runs anywhere - Node.js, Bun, or Deno - with unmatched flexibility and complete configurability for developers who refuse to sacrifice speed or control.

---

## 🧩 `@vercube/mcp` Module

The `@vercube/mcp` module provides seamless integration with the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) for the Vercube framework.  
It enables you to expose AI tools through a standardized interface, making your application's functionality accessible to LLM-powered agents and AI assistants.

### ✅ Key Features

- **Base class pattern** - extend `Tool<TArgs, TOutput>` for type-safe implementations
- **Decorator-based tool registration** with `@MCPTool` on the `execute` method
- **Automatic schema validation** using Zod
- **Type-safe tool definitions** with full TypeScript support via `z.infer`
- **Built-in HTTP endpoint** for MCP protocol communication
- **Tool annotations** for metadata (readOnly, idempotent, destructive hints)
- **Flexible return types** - strings, objects, or MCP-formatted content
- **Hot-reload support** - tools dynamically register/unregister
- **Error handling** with proper MCP error responses

---

## 🚀 Installation

```bash
pnpm install @vercube/mcp
```

---

## ⚙️ Usage

### 1. Add the MCP Plugin

Integrate the MCP plugin into your app setup:

```ts
import { createApp } from '@vercube/core';
import { MCPPlugin } from '@vercube/mcp';

const app = createApp({
  setup: async (app) => {
    app.addPlugin(MCPPlugin);
  },
});
```

### 2. Create MCP Tools

Define tools by extending the `Tool` base class and decorating the `execute` method with `@MCPTool`:

```ts
import { MCPTool, Tool } from '@vercube/mcp';
import { z } from 'zod/v3';

const inputSchema = z.object({
  location: z.string().describe('The city and state, e.g. San Francisco, CA'),
  unit: z.enum(['celsius', 'fahrenheit']).optional().describe('Temperature unit'),
});

const outputSchema = z.object({
  weather: z.string().describe('Weather description'),
  temperature: z.number().describe('Temperature value'),
  unit: z.string().describe('Temperature unit'),
});

export class WeatherTool extends Tool<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> {
  @MCPTool({
    name: 'getCurrentWeather',
    description: 'Get the current weather for a location',
    inputSchema,
    outputSchema,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  })
  public async execute(args: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> {
    // Your implementation
    return {
      weather: `Sunny in ${args.location}`,
      temperature: 72,
      unit: args.unit ?? 'fahrenheit',
    };
  }
}
```

### 3. Register Your Tool Class

Bind your tool class to the container:

```ts
import { Container } from '@vercube/di';
import { WeatherTool } from './Tools/WeatherTool';

export function useContainer(container: Container): void {
  container.bind(WeatherTool);
}
```

---

## 🧵 Complete Examples

### Simple String Response

```ts
import { MCPTool, Tool } from '@vercube/mcp';
import { z } from 'zod/v3';

const inputSchema = z.object({
  name: z.string().min(1).describe('The name of the person to greet'),
  language: z.enum(['en', 'es', 'fr', 'de']).optional().describe('Language for greeting'),
});

const outputSchema = z.object({
  greeting: z.string().describe('The greeting message'),
});

export class GreetTool extends Tool<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> {
  @MCPTool({
    name: 'greet',
    description: 'Greets a user with a personalized message',
    inputSchema,
    outputSchema,
  })
  public async execute(args: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> {
    const greetings = {
      en: `Hello, ${args.name}!`,
      es: `¡Hola, ${args.name}!`,
      fr: `Bonjour, ${args.name}!`,
      de: `Guten Tag, ${args.name}!`,
    };

    return {
      greeting: greetings[args.language ?? 'en'],
    };
  }
}
```

### Structured Object Response

```ts
import { MCPTool, Tool } from '@vercube/mcp';
import { z } from 'zod/v3';

const inputSchema = z.object({
  operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('Operation to perform'),
  a: z.number().describe('First number'),
  b: z.number().describe('Second number'),
});

const outputSchema = z.object({
  operation: z.string().describe('The operation that was performed'),
  inputs: z
    .object({
      a: z.number().describe('First input number'),
      b: z.number().describe('Second input number'),
    })
    .describe('The input values'),
  result: z.number().describe('The calculation result'),
});

export class CalculatorTool extends Tool<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> {
  @MCPTool({
    name: 'calculate',
    description: 'Performs basic mathematical operations',
    inputSchema,
    outputSchema,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  })
  public async execute(args: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> {
    let result: number;

    switch (args.operation) {
      case 'add':
        result = args.a + args.b;
        break;
      case 'subtract':
        result = args.a - args.b;
        break;
      case 'multiply':
        result = args.a * args.b;
        break;
      case 'divide':
        if (args.b === 0) throw new Error('Cannot divide by zero');
        result = args.a / args.b;
        break;
    }

    return {
      operation: args.operation,
      inputs: { a: args.a, b: args.b },
      result,
    };
  }
}
```

### MCP-Formatted Content Response

```ts
import { MCPTool, Tool } from '@vercube/mcp';
import { z } from 'zod/v3';

const inputSchema = z.object({});
const outputSchema = z.object({
  content: z.array(
    z.object({
      type: z.literal('text'),
      text: z.string(),
    }),
  ),
});

export class SystemInfoTool extends Tool<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> {
  @MCPTool({
    name: 'getSystemInfo',
    description: 'Returns information about the system',
    inputSchema,
    outputSchema,
    annotations: {
      readOnlyHint: true,
    },
  })
  public async execute(_args: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> {
    return {
      content: [
        {
          type: 'text' as const,
          text: `System Information:
- Platform: ${process.platform}
- Node Version: ${process.version}
- Architecture: ${process.arch}`,
        },
      ],
    };
  }
}
```

---

## 📋 Tool Metadata

### Input Schema

Define and validate input parameters using Zod schemas:

```ts
const inputSchema = z.object({
  query: z.string().min(1).max(100).describe('Search query'),
  limit: z.number().int().positive().max(50).optional().describe('Max results'),
  filters: z.object({
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
});

// In your Tool class:
export class SearchTool extends Tool<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> {
  @MCPTool({
    inputSchema,
    // ...
  })
}
```

### Output Schema

Specify expected output structure (for documentation purposes):

```ts
const outputSchema = z.object({
  results: z.array(z.object({
    id: z.string(),
    title: z.string(),
    score: z.number(),
  })),
  total: z.number(),
});

// In your Tool class:
export class SearchTool extends Tool<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> {
  @MCPTool({
    outputSchema,
    // ...
  })
}
```

### Annotations

Provide hints about tool behavior:

```ts
annotations: {
  readOnlyHint: true,      // Tool doesn't modify state
  idempotentHint: true,    // Same input = same output
  destructiveHint: true,   // Tool performs destructive operations
}
```

---

## 📄 Runtime Access to MCP Endpoint

When the `MCPPlugin` is added to your application, an MCP controller is automatically registered at:

```
http://localhost:3000/api/mcp
```

This endpoint handles the MCP protocol communication and makes all registered tools available to MCP clients.

### Testing with cURL

```bash
# List available tools
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Call a tool
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{"name":"greet","arguments":{"name":"Alice"}},
    "id":2
  }'
```

---

## 🎯 Return Value Handling

The MCP module automatically handles different return types:

1. **String**: Wrapped in `{ content: [{ type: 'text', text: value }] }`
2. **Object**: JSON-stringified and wrapped in text content
3. **MCP CallToolResult**: Passed through unchanged if it has `content` or `structuredContent`

### Error Handling

Errors are automatically caught and returned as MCP error responses:

```ts
{
  content: [{ type: 'text', text: 'Error: <error message>' }],
  isError: true
}
```

---

## 🔧 Advanced Features

### Dynamic Tool Registration

Tools are automatically registered when their container class is instantiated and unregistered when destroyed:

```ts
// Tool is automatically registered
const tool = container.get(WeatherTool);

// Tool is automatically unregistered on cleanup
container.unbind(WeatherTool);
```

### Tool Registry

Access the tool registry directly for advanced use cases:

```ts
import { ToolRegistry } from '@vercube/mcp';

const registry = container.get(ToolRegistry);

// List all registered tools
const tools = registry.list();

// Subscribe to registry changes
const unsubscribe = registry.subscribe((entries) => {
  console.log('Tools updated:', entries);
});
```

---

## 📚 Documentation

Full documentation is available at [**vercube.dev**](https://vercube.dev).  
Explore guides, API references, and best practices to master Vercube.

---

## 🙌 Credits

This module is built on top of:

- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) - Official MCP SDK
- [mcp-handler](https://github.com/mark-mabery/mcp-handler) - MCP HTTP handler utilities
- [Zod](https://zod.dev) - TypeScript-first schema validation

---

## 🪪 License

[MIT License](https://github.com/vercube/vercube/blob/main/LICENSE)
