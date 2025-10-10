<div align="center">
  <a href="https://vercube.dev/"><img src="https://github.com/OskarLebuda/vue-lazy-hydration/raw/main/.github/assets/logo.png?raw=true" alt="Vercube logo" width="200"></a>
  <br>
  <br>

# @vercube/serverless

Serverless deployment adapters for Vercube applications

  <a href="https://www.npmjs.com/package/@vercube/serverless">
    <img src="https://img.shields.io/npm/v/%40vercube%2Fserverless?style=for-the-badge&logo=npm&color=%23767eff" alt="npm"/>
  </a>
  <a href="https://www.npmjs.com/package/@vercube/serverless">
    <img src="https://img.shields.io/npm/dm/%40vercube%2Fserverless?style=for-the-badge&logo=npm&color=%23767eff" alt="npm"/>
  </a>
  <a href="https://github.com/vercube/vercube/blob/main/LICENSE" target="_blank">
    <img src="https://img.shields.io/npm/l/%40vercube%2Fserverless?style=for-the-badge&color=%23767eff" alt="License"/>
  </a>
  <a href="https://codecov.io/gh/vercube/vercube" target="_blank">
    <img src="https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&color=%23767eff" alt="Coverage"/>
  </a>
  <br/>
  <br/>
</div>

Deploy your Vercube applications to serverless platforms with zero configuration. This package provides seamless adapters for AWS Lambda, Vercel, and other serverless providers, allowing you to run your Vercube apps anywhere without code changes.

---

## 🧩 `@vercube/serverless` Module

The `@vercube/serverless` module provides unified, provider-agnostic adapters for deploying Vercube applications to serverless platforms. It abstracts the differences between various serverless providers into a consistent API, enabling easy deployment across different environments without modifying your application code.

### ✅ Key Features

- **AWS Lambda Integration** - Full support for API Gateway v1 and v2
- **Azure Functions Integration** - Complete support for Azure Functions HTTP triggers
- **Zero Configuration** - Works out-of-the-box with existing Vercube apps
- **Type Safety** - Complete TypeScript support with proper type definitions
- **Binary Support** - Automatic handling of binary content with base64 encoding
- **Cookie Support** - Proper cookie handling for both API Gateway versions and Azure Functions
- **Error Handling** - Robust error handling and validation
- **Performance Optimized** - Efficient request/response conversion

---

## 🚀 Installation

```bash
pnpm install @vercube/serverless
```

---

## ⚙️ Usage

### AWS Lambda Integration

Deploy your Vercube application to AWS Lambda with API Gateway:

```ts
// lambda.ts
import { createApp } from '@vercube/core';
import { toServerlessHandler } from '@vercube/serverless/aws-lambda';

const app = createApp();
export const handler = toServerlessHandler(app);
```

### Azure Functions Integration

Deploy your Vercube application to Azure Functions:

```ts
// httpTrigger.ts
import { createApp } from '@vercube/core';
import { toServerlessHandler } from '@vercube/serverless/azure-functions';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

const vercubeApp = createApp();
const handler = toServerlessHandler(vercubeApp);

export async function httpTrigger(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  return await handler(request);
}

app.http('httpTrigger', {
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
  authLevel: 'anonymous',
  route: '{*proxy}',
  handler: httpTrigger,
});
```

### Serverless Framework Configuration

```yaml
# serverless.yml
service: vercube-app

provider:
  name: aws
  runtime: nodejs22.x
  region: us-east-1

functions:
  api:
    handler: lambda.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
          cors: true
```

---

## 🔧 Supported Platforms

### AWS Lambda

Full support for AWS Lambda with API Gateway integration:

- **API Gateway v1** - Complete compatibility with `APIGatewayProxyEvent`
- **API Gateway v2** - Full support for `APIGatewayProxyEventV2`
- **Binary Content** - Automatic base64 encoding for binary responses
- **Cookies** - Proper cookie handling for both API Gateway versions
- **Headers** - Complete header conversion and processing

### Azure Functions

Complete support for Azure Functions HTTP triggers:

- **HTTP Triggers** - Full compatibility with Azure Functions HTTP triggers
- **Request/Response Conversion** - Seamless conversion between Azure Functions and web standards
- **Cookie Support** - Proper handling of Set-Cookie headers and cookie parsing
- **Headers** - Complete header conversion and processing
- **Streaming Support** - Efficient handling of request/response bodies with AsyncIterableIterator

---

## 📋 API Reference

### `toServerlessHandler(app: App)`

Converts a Vercube App instance into a serverless handler function.

**Parameters:**

- `app` - The Vercube App instance that will handle requests

**Returns:**

- An async function that accepts serverless events and returns platform-specific responses

**Examples:**

```ts
// AWS Lambda
import { createApp } from '@vercube/core';
import { toServerlessHandler } from '@vercube/serverless/aws-lambda';

const app = createApp();
export const handler = toServerlessHandler(app);
```

```ts
// Azure Functions
import { createApp } from '@vercube/core';
import { toServerlessHandler } from '@vercube/serverless/azure-functions';

const app = createApp();
export const handler = toServerlessHandler(app);
```

---

## 🔄 Request/Response Conversion

The serverless adapters handle automatic conversion between platform-specific events and standard web requests:

### Request Conversion

- **HTTP Method** - Extracted from event properties
- **URL Construction** - Built from path, query parameters, and headers
- **Headers** - Converted to standard Headers object
- **Body** - Properly decoded and converted to Request body

### Response Conversion

- **Status Code** - Mapped from Response status
- **Headers** - Converted to platform-specific format
- **Body** - Encoded appropriately (text vs binary for AWS, AsyncIterableIterator for Azure)
- **Cookies** - Handled for both API Gateway versions and Azure Functions

---

## 🚀 Performance Considerations

- **Streaming Support** - Efficient handling of large request/response bodies
- **Memory Optimization** - Minimal memory footprint for serverless environments
- **Cold Start Optimization** - Fast initialization and request processing
- **Binary Content** - Optimized base64 encoding for binary responses (AWS Lambda)
- **AsyncIterableIterator** - Efficient streaming for Azure Functions responses

---

## 🔍 Debugging

Enable debug logging to troubleshoot serverless deployments:

```ts
import { createApp } from '@vercube/core';
import { toServerlessHandler } from '@vercube/serverless/aws-lambda';

const app = createApp({
  logger: {
    level: 'debug',
  },
});

export const handler = toServerlessHandler(app);
```

---

## 📚 Documentation

Full documentation is available at [**vercube.dev**](https://vercube.dev).
Explore guides, API references, and best practices to master Vercube serverless deployment.

---

## 🙌 Credits

This module is inspired by:

- [Nitro AWS Lambda Preset](https://nitro.build/presets/aws-lambda)
- [Hono AWS Lambda Adapter](https://hono.dev/guides/aws-lambda)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [hono-azurefunc-adapter](https://github.com/Marplex/hono-azurefunc-adapter)

---

## 🪪 License

[MIT License](https://github.com/vercube/vercube/blob/main/LICENSE)
