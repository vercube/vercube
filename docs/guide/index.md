# What is Vercube

## Motivation

Modern Node.js applications often require complex architectures that enable the creation of scalable and maintainable systems. Existing frameworks like Express or Koa provide basic functionality but typically require additional libraries and configuration to achieve a modern application architecture.

Routing-controllers was a step in the right direction, introducing a decorator and class-based approach, but with the evolution of the JavaScript/TypeScript ecosystem and the emergence of new standards and runtimes (Bun, Deno), there was a need to create a new solution that:

- Fully utilizes the capabilities of the latest versions of TypeScript and JavaScript
- Offers configuration flexibility while maintaining ease of use
- Provides high performance without unnecessary overhead
- Is compatible with various JavaScript runtime environments
- Supports both ESM and CJS
- Ensures excellent developer experience (DX)

These needs were the direct inspiration for creating Vercube - a modern, efficient, and flexible framework that solves the problems of existing solutions while offering new possibilities.

## What is Vercube

Vercube is a modern Node.js framework based on object-oriented programming (OOP) paradigm and TypeScript decorators, enabling the creation of server applications in an elegant and type-safe manner. The framework is built from the ground up using [H3](https://h3.unjs.io/) - an ultra-lightweight and efficient HTTP framework, which ensures exceptional performance and low resource usage. Vercube is designed to leverage the latest features of TypeScript while offering compatibility with various JavaScript runtime environments (Node.js, Bun, Deno).

Key features of Vercube:

- **Declarative routing** - thanks to TypeScript decorators, you can declare API endpoints in a readable and concise way
- **Dependency Injection** - built-in dependency injection system that facilitates code organization and testing
- **Runtime agnostic** - works independently of the runtime environment (Node.js, and in the future Bun and Deno)
- **Modularity** - flexible architecture that allows for creating modular applications
- **Zero-config** - default configurations that allow for quick start without unnecessary setup
- **Type safety** - full support for TypeScript that ensures type safety at all levels of the application
- **Support for ESM and CommonJS** - compatibility with both module systems
- **High performance** - optimized architecture based on h3 providing exceptional speed and minimal resource usage

Vercube can be seen as a modern evolution of the concepts introduced by routing-controllers, but with better implementation, support for the latest standards, and much greater flexibility.

## Why Vercube?

In the Node.js ecosystem, there are many frameworks such as [Express](https://expressjs.com/), [Koa](https://koajs.com/), [Fastify](https://fastify.dev/), [NestJS](https://nestjs.com/), or [Ts.ED](https://tsed.dev/). So why choose Vercube? Here are the main reasons:

### Performance without compromise

Vercube has been designed with performance in mind from the very beginning. Built on the foundation of the ultra-fast [H3](https://h3.unjs.io/) HTTP framework, it provides exceptional performance and minimal latency. Unlike some feature-rich frameworks (like NestJS), Vercube has a minimalist internal architecture that doesn't burden applications with unnecessary overhead. At the same time, it offers advanced features that typically require additional libraries in lighter frameworks (like Express).

### Superior developer experience

Vercube focuses on excellent developer experience (DX) through:
- Intuitive decorator-based API
- Extensive TypeScript hints and support
- Clear and understandable error messages
- Consistent and predictable application structure
- Minimalist configuration while maintaining flexibility

### Flexibility and scalability

Vercube offers various levels of abstraction that adapt to project needs:
- Ability to quickly prototype with "zero-config" configuration
- Support for modular architecture in larger applications
- Possibility to integrate with existing libraries and middlewares
- Scalability from simple APIs to complex enterprise applications

### Compatibility with modern standards

Vercube supports the latest standards and technologies:
- Full support for ESM (ECMAScript Modules)
- Backward compatibility with CommonJS
- Support for the latest TypeScript features
- Preparation for various runtime environments (Node.js, Bun, Deno)

### Unique features unavailable in other frameworks

Vercube introduces a number of unique features that distinguish it from the competition:
- Advanced decorator system that simplifies typical server operations
- Intelligent detection and auto-configuration system
- Optimized dependency injection system tailored to TypeScript specifics
- Flexible middleware system working at different application levels

Vercube is the ideal solution for teams and developers looking for a modern, efficient, and flexible framework that offers excellent developer experience without compromising on performance or functionality.