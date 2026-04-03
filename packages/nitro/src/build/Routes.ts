import { readFileSync } from 'node:fs';
import { parseSync } from 'oxc-parser';
import type { FileInfo } from '../_internal/scan';

/**
 * Represents a single extracted route from a controller class.
 */
export interface RouteInfo extends FileInfo {
  /** The import statement required to load the controller class from the internal route plugin. */
  import: string;
  /** The name of the import statement. */
  importClassName: string;
  /** The full normalized route path, including the base controller path and method path. */
  route: string;
  /** The HTTP method in uppercase (e.g. 'GET', 'POST', 'PUT'). */
  method: string;
  /** Array of route parameter names extracted from path segments prefixed with ':'. */
  params: string[];
}

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
 * Pre-compiled regular expression for extracting named route parameters.
 * Matches path segments prefixed with ':' (e.g. ':id', ':slug').
 * Uses the global flag for iterative matching via `exec`.
 */
const PARAM_RE = /:([^/]+)/g;

/**
 * Internal module path used for generated import statements.
 */
export const IMPORT_SOURCE = '#internal/vercube-route-plugin';

/**
 * Reads a controller file from disk and returns all routes defined in classes
 * decorated with `Controller` and methods decorated with HTTP decorators (Get, Post, etc.).
 * @param route - File info (path and fullPath) to analyze.
 * @returns List of `RouteInfo` for every route in the file.
 */
export async function transformRoute(route: FileInfo): Promise<RouteInfo[]> {
  const parsedRoute = extractRoutes(readFileSync(route.fullPath, 'utf8'));

  return parsedRoute.map((parsedRoute) => ({
    ...parsedRoute,
    ...route,
  }));
}

/**
 * Extracts all route definitions from the given TypeScript/JavaScript source code.
 *
 * Parses the source using `oxc-parser` and traverses the resulting AST to find
 * classes decorated with `@Controller(path)`. For each such class, it inspects
 * method definitions for HTTP method decorators (`@Get`, `@Post`, `@Put`, `@Delete`,
 * `@Patch`, `@Options`, `@Head`) and constructs full route paths by concatenating
 * the controller base path with the method-level path.
 *
 * Generates appropriate import statements based on the export style:
 * - `export default class Foo` → `import Foo from '...'`
 * - `export class Foo` → `import { Foo } from '...'`
 *
 * Supports classes declared via `export class`, `export default class`,
 * and plain `class` declarations.
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

    const importStatement = isDefault
      ? `import ${className} from '${IMPORT_SOURCE}';`
      : `import { ${className} } from '${IMPORT_SOURCE}';`;

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
 * Unwraps export declarations to retrieve the underlying class node,
 * along with metadata about the export style.
 *
 * Handles the following AST patterns:
 * - `ExportDefaultDeclaration` wrapping a `ClassDeclaration` → `isDefault: true`
 * - `ExportNamedDeclaration` wrapping a `ClassDeclaration` → `isDefault: false`
 * - Direct `ClassDeclaration` or `Class` nodes → `isDefault: false`
 *
 * @param node - An AST node from the program body to inspect.
 * @returns An object containing the class AST node and whether it is a default export, or `null` if not a class.
 */
function getClassNode(node: any): { classNode: any; isDefault: boolean } | null {
  if (node.type === 'ExportDefaultDeclaration') {
    const decl = node.declaration;
    if (decl?.type === 'ClassDeclaration' || decl?.type === 'Class') {
      return { classNode: decl, isDefault: true };
    }
  }
  if (node.type === 'ExportNamedDeclaration') {
    const decl = node.declaration;
    if (decl?.type === 'ClassDeclaration' || decl?.type === 'Class') {
      return { classNode: decl, isDefault: false };
    }
  }
  if (node?.type === 'ClassDeclaration' || node?.type === 'Class') {
    return { classNode: node, isDefault: false };
  }
  return null;
}

/**
 * Searches a list of decorators for a `CallExpression` matching the given name
 * and extracts its first string argument.
 *
 * This is used to retrieve the path argument from decorators like `@Controller('/api/foo')`.
 * If the decorator is found but has no string argument, an empty string is returned.
 * If no matching decorator is found, `null` is returned.
 *
 * @param decorators - The array of decorator AST nodes to search, or `undefined` if none exist.
 * @param name - The decorator function name to match against (e.g. 'Controller').
 * @returns The string argument value, an empty string if no argument is provided, or `null` if the decorator is not found.
 */
function extractDecoratorArg(decorators: any[] | undefined, name: string): string | null {
  if (!decorators) return null;
  for (const dec of decorators) {
    const expr = dec.expression;
    if (expr?.type === 'CallExpression' && expr.callee?.name === name) {
      const arg = expr.arguments?.[0];
      if (arg?.type === 'Literal' && typeof arg.value === 'string') {
        return arg.value;
      }
      return '';
    }
  }
  return null;
}

/**
 * Normalizes a route path by removing duplicate slashes and ensuring
 * the path starts with a single leading slash.
 *
 * Splits the path on '/' separators, filters out empty segments,
 * and rejoins with single '/' separators.
 *
 * @param path - The raw concatenated path string to normalize.
 * @returns A cleaned path string with a leading slash and no duplicate separators.
 */
function normalizePath(path: string): string {
  return '/' + path.split('/').filter(Boolean).join('/');
}

/**
 * Extracts named route parameters from a path string.
 *
 * Scans the path for segments prefixed with ':' using a pre-compiled
 * regular expression and returns an array of parameter names with
 * the ':' prefix stripped.
 *
 * Resets the regex `lastIndex` after each invocation to ensure
 * consistent behavior across repeated calls.
 *
 * @param route - The normalized route path to scan for parameters.
 * @returns An array of parameter name strings, empty if none are found.
 */
function extractParams(route: string): string[] {
  const params: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = PARAM_RE.exec(route))) {
    params.push(match[1]);
  }
  PARAM_RE.lastIndex = 0;
  return params;
}
