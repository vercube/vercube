# Contributing to Vercube

Thank you for your interest in contributing to Vercube! 💜

This document provides guidelines and instructions for contributing to our project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and considerate of differing viewpoints and experiences.

## How to Contribute

### Reporting Bugs

- Check if the bug has already been reported in the [Issues](https://github.com/vercube/vercube/issues) section
- If not, create a new issue with:
  - A clear, descriptive title
  - Detailed steps to reproduce the bug
  - Expected behavior
  - Actual behavior
  - Screenshots if applicable
  - Environment details (OS, Node.js version, etc.)
  - Reproduction link (using StackBlitz or other online web container)

### Suggesting Enhancements

- Check if the enhancement has already been suggested in the [Issues](https://github.com/vercube/vercube/issues) section
- Create a new issue with:
  - A clear, descriptive title
  - Detailed description of the proposed enhancement
  - Use cases and examples
  - Any relevant technical considerations
  - Reproduction link (using StackBlitz or other online web container)

### Pull Requests

1. Fork the repository
2. Create a new branch for your feature/fix (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests to ensure your changes don't break existing functionality
5. Commit your changes (`git commit -m 'Add some amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Setup

1. Clone the repository:

   ```sh
   git clone https://github.com/vercube/vercube.git
   cd vercube
   ```

2. Install dependencies:

   ```sh
   pnpm install
   ```

3. Run tests:

   ```sh
   pnpm test
   ```

   The `@vercube/scheduler` store suites run against real services only when they are configured, and are skipped otherwise:

   ```sh
   docker run -d --rm -p 6379:6379 redis:7-alpine
   docker run -d --rm -e POSTGRES_PASSWORD=pg -p 5432:5432 postgres:17-alpine

   REDIS_URL=redis://127.0.0.1:6379 DATABASE_URL=postgres://postgres:pg@127.0.0.1:5432/postgres pnpm test
   ```

4. Start the playground:
   ```sh
   pnpm playground
   ```
   The playground is a development environment where you can test your changes in real-time. It provides a sandbox environment to experiment with Vercube features and test your modifications before submitting a pull request.

### Benchmarks

A change to the request path comes with numbers. The ladder is one application whose routes each isolate one cost (a body, a schema, a middleware, a 404, the default configuration), measured on real sockets under Bun and Node with [bombardier](https://github.com/codesandbox/bombardier):

```sh
pnpm build
pnpm bench:ladder
```

To compare a change with the code it started from, keep a copy of the build from before and measure both in one run. Every rung is measured on each build in turn, so the two columns see the same machine:

```sh
cp -R packages/core/dist packages/core/tmp/before
# make the change, then
pnpm build
pnpm bench:ladder --target before=packages/core/tmp/before/index.mjs --target after=packages/core/dist/index.mjs
```

`--rungs plain,body,404` limits the run to some rungs, `--runtime bun,node,deno` picks the runtimes, `--out results.json` keeps the numbers and `pnpm bench:ladder compare a.json b.json` renders stored results side by side. Put the table in the pull request.

The same routes run in process with `pnpm test:bench`, which is quicker but does not see the server.

## Coding Standards

- Follow the existing code style and formatting
- Write clear, descriptive commit messages
- Include tests for new features
- Update documentation as needed
- Keep pull requests focused and manageable

## Documentation

- Update README.md if needed
- Add or update documentation for new features
- Ensure code comments are clear and helpful
- Update API documentation if you modify endpoints

## Getting Help

- Join our [Discord server](https://discord.gg/safphS45aN) for real-time discussions
- Check existing issues and pull requests
- Ask questions in the issues section

## Recognition

Contributors will be recognized in our project documentation and release notes. Significant contributions may be highlighted in our blog or social media channels.

Thank you for contributing to Vercube! Your contributions help make this project better for everyone.
