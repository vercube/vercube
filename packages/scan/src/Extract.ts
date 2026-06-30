import { parseSync } from 'oxc-parser';
import {
  buildImport,
  extendsSuperClass,
  extractDecoratorArg,
  extractParams,
  getClassNode,
  hasDecorator,
  normalizePath,
} from './Ast';
import type { MiddlewareInfo, RouteInfo, ServiceInfo } from './Types';

/**
 * Placeholder module specifier embedded in generated route imports.
 * Callers resolve it to the real file path once known (see {@link Transform}).
 */
export const IMPORT_SOURCE = '#internal/vercube-route-plugin';

/**
 * Placeholder module specifier embedded in generated service imports.
 */
export const SERVICE_IMPORT_SOURCE = '#internal/vercube-service-source';

/**
 * Placeholder module specifier embedded in generated middleware imports.
 */
export const MIDDLEWARE_IMPORT_SOURCE = '#internal/vercube-middleware-source';

/**
 * Mapping of decorator names to their corresponding uppercase HTTP method strings.
 * Used for O(1) lookup and simultaneous method name resolution.
 */
const HTTP_METHODS: Record<string, string> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Delete: 'DELETE',
  Patch: 'PATCH',
  Options: 'OPTIONS',
  Head: 'HEAD',
};

/**
 * Extracts all route definitions from the given TypeScript/JavaScript source code.
 *
 * Parses the source using `oxc-parser` and traverses the resulting AST to find
 * classes decorated with `@Controller(path)`. For each such class, it inspects
 * method definitions for HTTP method decorators (`@Get`, `@Post`, `@Put`, `@Delete`,
 * `@Patch`, `@Options`, `@Head`) and constructs full route paths by concatenating
 * the controller base path with the method-level path.
 *
 * @param code - The raw TypeScript or JavaScript source code string to analyze.
 * @returns An array of {@link RouteInfo} objects representing all discovered routes.
 */
export function extractRoutes(code: string): RouteInfo[] {
  const ast = parseSync('file.ts', code).program;
  const routes: RouteInfo[] = [];

  for (const node of ast.body) {
    const classInfo = getClassNode(node);
    if (!classInfo) continue;

    const { classNode, isDefault } = classInfo;

    const basePath = extractDecoratorArg(classNode.decorators, 'Controller');
    if (basePath === null) continue;

    const className = classNode.id?.name;
    if (!className) continue;

    const importStatement = buildImport(className, IMPORT_SOURCE, isDefault);

    for (const member of classNode.body?.body ?? []) {
      if (member.type !== 'MethodDefinition') continue;

      for (const decorator of member.decorators ?? []) {
        const expr = decorator.expression;
        if (expr?.type !== 'CallExpression') continue;

        const method = HTTP_METHODS[expr.callee?.name];
        if (!method) continue;

        const arg = expr.arguments?.[0];
        const path = arg?.type === 'Literal' && typeof arg.value === 'string' ? arg.value : '';
        const fullRoute = normalizePath(basePath + path);

        routes.push({
          import: importStatement,
          importClassName: className,
          route: fullRoute,
          method,
          fullPath: '',
          path: '',
          params: extractParams(fullRoute),
        });
      }
    }
  }

  return routes;
}

/**
 * Extracts every `@Controller`-decorated class from the given source code,
 * regardless of whether it declares HTTP method routes.
 *
 * Unlike {@link extractRoutes} (which emits one entry per HTTP route method),
 * this returns one entry per controller class — so controllers that only carry
 * non-HTTP handlers (e.g. WebSocket `@Message` methods) are still discovered for
 * binding into the DI container.
 *
 * @param code - The raw TypeScript or JavaScript source code string to analyze.
 * @returns An array of {@link ServiceInfo} objects for all discovered controller classes.
 */
export function extractControllers(code: string): ServiceInfo[] {
  const ast = parseSync('file.ts', code).program;
  const controllers: ServiceInfo[] = [];

  for (const node of ast.body) {
    const classInfo = getClassNode(node);
    if (!classInfo) continue;

    const { classNode, isDefault } = classInfo;

    if (extractDecoratorArg(classNode.decorators, 'Controller') === null) continue;

    const className = classNode.id?.name;
    if (!className) continue;

    controllers.push({
      import: buildImport(className, IMPORT_SOURCE, isDefault),
      importClassName: className,
      fullPath: '',
      path: '',
    });
  }

  return controllers;
}

/**
 * Extracts all `@Injectable`-decorated class definitions from the given source code.
 *
 * @param code - The raw TypeScript or JavaScript source code string to analyze.
 * @returns An array of {@link ServiceInfo} objects for all discovered injectable classes.
 */
export function extractServices(code: string): ServiceInfo[] {
  const ast = parseSync('file.ts', code).program;
  const services: ServiceInfo[] = [];

  for (const node of ast.body) {
    const classInfo = getClassNode(node);
    if (!classInfo) continue;

    const { classNode, isDefault } = classInfo;

    if (!hasDecorator(classNode.decorators, 'Injectable')) continue;

    const className = classNode.id?.name;
    if (!className) continue;

    services.push({
      import: buildImport(className, SERVICE_IMPORT_SOURCE, isDefault),
      importClassName: className,
      fullPath: '',
      path: '',
    });
  }

  return services;
}

/**
 * Extracts all class definitions that extend `BaseMiddleware` from the given source code.
 *
 * @param code - The raw TypeScript or JavaScript source code string to analyze.
 * @returns An array of {@link MiddlewareInfo} objects for all discovered middleware classes.
 */
export function extractMiddlewares(code: string): MiddlewareInfo[] {
  const ast = parseSync('file.ts', code).program;
  const middlewares: MiddlewareInfo[] = [];

  for (const node of ast.body) {
    const classInfo = getClassNode(node);
    if (!classInfo) continue;

    const { classNode, isDefault } = classInfo;

    if (!extendsSuperClass(classNode, 'BaseMiddleware')) continue;

    const className = classNode.id?.name;
    if (!className) continue;

    middlewares.push({
      import: buildImport(className, MIDDLEWARE_IMPORT_SOURCE, isDefault),
      importClassName: className,
      fullPath: '',
      path: '',
    });
  }

  return middlewares;
}
