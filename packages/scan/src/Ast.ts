/**
 * Pre-compiled regular expression for extracting named route parameters.
 * Matches path segments prefixed with ':' (e.g. ':id', ':slug').
 * Uses the global flag for iterative matching via `exec`.
 */
const PARAM_RE = /:([^/]+)/g;

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
export function getClassNode(node: any): { classNode: any; isDefault: boolean } | null {
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
 * Builds an import statement for a class, choosing default vs named syntax.
 *
 * @param className - The class identifier to import.
 * @param source - The module specifier to import from.
 * @param isDefault - Whether the class is a default export.
 * @returns The generated import statement string.
 */
export function buildImport(className: string, source: string, isDefault: boolean): string {
  return isDefault ? `import ${className} from '${source}';` : `import { ${className} } from '${source}';`;
}

/**
 * Searches a list of decorators for a `CallExpression` matching the given name
 * and extracts its first string argument.
 *
 * Used to retrieve the path argument from decorators like `@Controller('/api/foo')`.
 * If the decorator is found but has no string argument, an empty string is returned.
 * If no matching decorator is found, `null` is returned.
 *
 * @param decorators - The array of decorator AST nodes to search, or `undefined` if none exist.
 * @param name - The decorator function name to match against (e.g. 'Controller').
 * @returns The string argument value, an empty string if no argument is provided, or `null` if the decorator is not found.
 */
export function extractDecoratorArg(decorators: any[] | undefined, name: string): string | null {
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
 * Returns true if the given decorators array contains a decorator matching `name`.
 * Supports both `@Name` identifier and `@Name()` call expression styles.
 *
 * @param decorators - The array of decorator AST nodes to search.
 * @param name - The decorator name to match.
 * @returns Whether a matching decorator exists.
 */
export function hasDecorator(decorators: any[] | undefined, name: string): boolean {
  if (!decorators) return false;
  for (const dec of decorators) {
    const expr = dec.expression;
    if (expr?.type === 'CallExpression' && expr.callee?.name === name) return true;
    if (expr?.type === 'Identifier' && expr.name === name) return true;
  }
  return false;
}

/**
 * Returns true if the class node extends a superclass with the given name.
 *
 * @param classNode - The class AST node to inspect.
 * @param name - The expected superclass identifier name.
 * @returns Whether the class extends the named superclass.
 */
export function extendsSuperClass(classNode: any, name: string): boolean {
  return classNode.superClass?.type === 'Identifier' && classNode.superClass.name === name;
}

/**
 * Normalizes a route path by removing duplicate slashes and ensuring
 * the path starts with a single leading slash.
 *
 * @param path - The raw concatenated path string to normalize.
 * @returns A cleaned path string with a leading slash and no duplicate separators.
 */
export function normalizePath(path: string): string {
  return '/' + path.split('/').filter(Boolean).join('/');
}

/**
 * Extracts named route parameters from a path string.
 *
 * Scans the path for segments prefixed with ':' and returns an array of
 * parameter names with the ':' prefix stripped.
 *
 * @param route - The normalized route path to scan for parameters.
 * @returns An array of parameter name strings, empty if none are found.
 */
export function extractParams(route: string): string[] {
  const params: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = PARAM_RE.exec(route))) {
    params.push(match[1]);
  }
  PARAM_RE.lastIndex = 0;
  return params;
}
