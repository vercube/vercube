# What is Vercube

## Motivation

Modern JavaScript applications often require complex architectures that enable the creation of scalable and maintainable systems. Existing frameworks like Express or Koa provide basic functionality but typically require additional libraries and configuration to achieve a modern application architecture.

[Routing-controllers](https://github.com/typestack/routing-controllers) was a step in the right direction, introducing a decorator and class-based approach, but with the evolution of the JavaScript/TypeScript ecosystem and the emergence of new standards and runtimes (Bun, Deno), there was a need to create a new solution that:

- Fully utilizes the capabilities of the latest versions of TypeScript and JavaScript
- Offers configuration flexibility while maintaining ease of use
- Provides high performance without unnecessary overhead
- Is compatible with various JavaScript runtime environments
- Supports both ESM and CJS
- Ensures excellent developer experience (DX)

These needs were the direct inspiration for creating Vercube - a modern, efficient, and flexible framework that solves the problems of existing solutions while offering new possibilities.

## What is Vercube

Vercube is a modern JavaScript framework based on object-oriented programming (OOP) paradigm and TypeScript decorators, enabling the creation of server applications in an elegant and type-safe manner. The framework is built from the ground up using native Request and Response interfaces without relying on any additional HTTP frameworks, which ensures exceptional performance, low resource usage, and runtime agnosticism. Vercube seamlessly runs on different JavaScript environments (Node.js, Bun, Deno) by leveraging native interfaces common across all modern runtimes.

Key features of Vercube:

- **Declarative routing** - thanks to TypeScript decorators, you can declare API endpoints in a readable and concise way
- **Dependency Injection** - built-in dependency injection system that facilitates code organization and testing
- **Runtime agnostic** - works independently across all runtime environments (Node.js, Bun, Deno) using native interfaces
- **Modularity** - flexible architecture that allows for creating modular applications
- **Zero-config** - default configurations that allow for quick start without unnecessary setup
- **Type safety** - full support for TypeScript that ensures type safety at all levels of the application
- **Support for ESM and CommonJS** - compatibility with both module systems
- **High performance** - optimized architecture using direct Request/Response handling for exceptional speed and minimal resource usage

Vercube can be seen as a modern evolution of the concepts introduced by routing-controllers, but with better implementation, support for the latest standards, and much greater flexibility.

## Why Vercube?

In the JavaScript ecosystem, there are many frameworks such as [Express](https://expressjs.com/), [Koa](https://koajs.com/), [Fastify](https://fastify.dev/), [NestJS](https://nestjs.com/), [Routing-Controllers](https://github.com/typestack/routing-controllers), or [Ts.ED](https://tsed.dev/). So why choose Vercube? Here are the main reasons:

### Performance without compromise

Vercube has been designed with performance as the absolute priority from the very beginning. Built on native Request and Response interfaces with zero middleware overhead, it delivers unmatched speed and minimal latency across all runtime environments. Unlike other feature-rich frameworks (like NestJS), Vercube maintains a minimalist internal architecture that doesn't burden applications with unnecessary overhead. At the same time, it offers advanced features that typically require additional libraries in lighter frameworks (like Express).

### Superior developer experience

Vercube focuses on excellent developer experience (DX) through:
- Intuitive decorator-based API
- Extensive TypeScript hints and support
- Clear and understandable error messages
- Consistent and predictable application structure
- Minimalist configuration while maintaining complete flexibility

### Flexibility and scalability

Vercube offers various levels of abstraction that adapt to project needs:
- Ability to quickly prototype with "zero-config" configuration
- Support for modular architecture in larger applications
- Possibility to integrate with existing libraries and middlewares
- Scalability from simple APIs to complex enterprise applications
- Full control over the underlying request and response objects

### Compatibility with modern standards

Vercube supports the latest standards and technologies:
- Full support for ESM (ECMAScript Modules)
- Backward compatibility with CommonJS
- Support for the latest TypeScript features
- Native support for all modern runtime environments (Node.js, Bun, Deno)

### Unique features unavailable in other frameworks

Vercube introduces a number of unique features that distinguish it from the competition:
- Advanced decorator system that simplifies typical server operations
- Intelligent detection and auto-configuration system
- Optimized dependency injection system tailored to TypeScript specifics
- Flexible middleware system working at different application levels
- Direct access to native Request/Response objects without abstractions

Vercube is the ideal solution for teams and developers looking for a modern, efficient, and flexible framework that offers excellent developer experience without compromising on performance or functionality.