import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'pathe';

/**
 * The files of the `api` starter template (vercube/starter, branch `template`),
 * the project recipes are written against.
 */
export const API_TEMPLATE: Record<string, string> = {
  'package.json':
    '{\n  "name": "vercube-starter-app",\n  "version": "1.0.0",\n  "description": "Vercube Starter App",\n  "packageManager": "pnpm@12.14.0",\n  "private": true,\n  "type": "module",\n  "scripts": {\n    "build": "vercube build",\n    "dev": "vercube dev",\n    "test:tscheck": "tsc --noEmit",\n    "test:lint": "oxlint . && oxfmt --check",\n    "lint:fix": "oxlint --fix . && oxfmt --no-error-on-unmatched-pattern"\n  },\n  "license": "ISC",\n  "dependencies": {\n    "@oxc-project/runtime": "latest",\n    "@vercube/core": "latest",\n    "@vercube/di": "latest"\n  },\n  "devDependencies": {\n    "@types/bun": "^1.4.4",\n    "@vercube/cli": "latest",\n    "oxfmt": "^0.77.0",\n    "oxlint": "^1.92.0",\n    "tslib": "^2.9.1",\n    "typescript": "^7.0.2"\n  }\n}\n',
  'vercube.config.ts':
    "import { defineConfig } from '@vercube/core';\n\nexport default defineConfig({\n  logLevel: 'debug',\n\n  server: {\n    port: 3000,\n  },\n});\n",
  'src/index.ts':
    "import { useContainer } from '@/boot/Container';\nimport { createApp, type App, type RequestHandler } from '@vercube/core';\n\nconst app: App = await createApp();\napp.container.expand(useContainer);\n\nawait app.listen();\n\nexport default {\n  fetch: app.fetch.bind(app) as RequestHandler,\n};\n",
  'src/boot/Container.ts':
    "import FooController from '@/controller/FooController';\nimport { Container } from '@vercube/di';\n\nexport function useContainer(container: Container): void {\n  // register controllers\n  container.bind(FooController);\n}\n",
  'src/controller/FooController.ts':
    "import { Controller, Get } from '@vercube/core';\n\n/**\n * Foo controller.\n * This is a sample controller that demonstrates how to create a controller using the @vercube/core package.\n */\n@Controller('/api/foo')\nexport default class PlaygroundController {\n  /**\n   * Handles GET requests to the / endpoint.\n   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.\n   */\n  @Get('/')\n  public async index(): Promise<{ message: string }> {\n    return { message: 'Hello, world!' };\n  }\n}\n",
  'tsconfig.json':
    '{\n  "compilerOptions": {\n    "rootDir": ".",\n    "target": "ESNext",\n    "module": "ESNext",\n    "moduleResolution": "bundler",\n    "noImplicitAny": true,\n    "noImplicitReturns": true,\n    "noImplicitThis": true,\n    "strictNullChecks": true,\n    "esModuleInterop": true,\n    "sourceMap": false,\n    "experimentalDecorators": true,\n    "emitDecoratorMetadata": false,\n    "allowSyntheticDefaultImports": true,\n    "resolveJsonModule": true,\n    "noEmit": false,\n    "importHelpers": true,\n    "skipLibCheck": true,\n    "verbatimModuleSyntax": true,\n    "isolatedDeclarations": true,\n    "declaration": true,\n    "lib": ["es2022", "ESNext"],\n    "types": ["bun"],\n    "typeRoots": [\n      "node_modules/@types"\n    ],\n    "paths": {\n      "@/*": [\n        "./src/*"\n      ]\n    }\n  },\n  "include": [\n    "./src/**/*.ts"\n  ],\n  "exclude": [\n    "node_modules"\n  ]\n}\n',
};

/**
 * Writes the `api` starter template to a fresh temporary directory.
 *
 * @param overrides - Files to write over or next to the template's
 * @returns The directory
 */
export function apiTemplate(overrides: Record<string, string | null> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'vercube-recipe-'));

  for (const [file, content] of Object.entries({ ...API_TEMPLATE, ...overrides })) {
    if (content === null) {
      continue;
    }

    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), content);
  }

  return dir;
}
