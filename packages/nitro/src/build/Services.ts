import { readFileSync } from 'node:fs';
import { parseSync } from 'oxc-parser';
import type { FileInfo } from '../_internal/scan';

/**
 * Represents a single injectable service class discovered during scanning.
 */
export interface ServiceInfo extends FileInfo {
  /** The import statement required to load the service class from the internal plugin. */
  import: string;
  /** The name of the imported class. */
  importClassName: string;
}

/**
 * Internal module path used as a placeholder in generated import statements.
 * Replaced with the actual file path during setup.
 */
export const SERVICE_IMPORT_SOURCE = '#internal/vercube-service-source';

/**
 * Reads a file from disk and returns all `@Injectable`-decorated classes found within it.
 */
export async function transformService(file: FileInfo): Promise<ServiceInfo[]> {
  const parsed = extractServices(readFileSync(file.fullPath, 'utf8'));
  return parsed.map((s) => ({ ...s, ...file }));
}

/**
 * Extracts all `@Injectable`-decorated class definitions from the given source code.
 *
 * Parses the source using `oxc-parser` and traverses the AST to find classes
 * annotated with `@Injectable()`. Generates appropriate import statements based
 * on whether the class is a default or named export.
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

    const importStatement = isDefault
      ? `import ${className} from '${SERVICE_IMPORT_SOURCE}';`
      : `import { ${className} } from '${SERVICE_IMPORT_SOURCE}';`;

    services.push({
      import: importStatement,
      importClassName: className,
      fullPath: '',
      path: '',
    });
  }

  return services;
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

/**
 * Returns true if the given decorators array contains a decorator matching `name`.
 * Supports both `@Name` identifier and `@Name()` call expression styles.
 */
function hasDecorator(decorators: any[] | undefined, name: string): boolean {
  if (!decorators) return false;
  for (const dec of decorators) {
    const expr = dec.expression;
    if (expr?.type === 'CallExpression' && expr.callee?.name === name) return true;
    if (expr?.type === 'Identifier' && expr.name === name) return true;
  }
  return false;
}
