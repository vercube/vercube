import { readFileSync } from 'node:fs';
import { parseSync } from 'oxc-parser';
import type { FileInfo } from '../_internal/scan';

/**
 * Represents a single middleware class discovered during scanning.
 */
export interface MiddlewareInfo extends FileInfo {
  /** The import statement required to load the middleware class from the internal plugin. */
  import: string;
  /** The name of the imported class. */
  importClassName: string;
}

/**
 * Internal module path used as a placeholder in generated import statements.
 * Replaced with the actual file path during setup.
 */
export const MIDDLEWARE_IMPORT_SOURCE = '#internal/vercube-middleware-source';

/**
 * Reads a file from disk and returns all classes extending `BaseMiddleware` found within it.
 */
export async function transformMiddleware(file: FileInfo): Promise<MiddlewareInfo[]> {
  const parsed = extractMiddlewares(readFileSync(file.fullPath, 'utf8'));
  return parsed.map((m) => ({ ...m, ...file }));
}

/**
 * Extracts all class definitions that extend `BaseMiddleware` from the given source code.
 *
 * Parses the source using `oxc-parser` and traverses the AST to find classes
 * whose `superClass` resolves to the identifier `BaseMiddleware`. Generates
 * appropriate import statements based on whether the class is a default or named export.
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

    if (!extendsBaseMiddleware(classNode)) continue;

    const className = classNode.id?.name;
    if (!className) continue;

    const importStatement = isDefault
      ? `import ${className} from '${MIDDLEWARE_IMPORT_SOURCE}';`
      : `import { ${className} } from '${MIDDLEWARE_IMPORT_SOURCE}';`;

    middlewares.push({
      import: importStatement,
      importClassName: className,
      fullPath: '',
      path: '',
    });
  }

  return middlewares;
}

/**
 * Returns true if the class node extends `BaseMiddleware`.
 */
function extendsBaseMiddleware(classNode: any): boolean {
  return classNode.superClass?.type === 'Identifier' && classNode.superClass.name === 'BaseMiddleware';
}

/**
 * Unwraps export declarations to retrieve the underlying class node,
 * along with metadata about the export style.
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
