import { Container, describeContainer, Inject } from '@vercube/di';
import { BasePlugin } from '../../Plugins/BasePlugin';
import type { IntrospectionTypes } from '../../../Types/IntrospectionTypes';
import type { MetadataTypes } from '../../../Types/MetadataTypes';
import type { Describe } from '@vercube/di';

/**
 * Services the framework binds for itself.
 *
 * Separating them out is what lets a consumer hide the plumbing and show only
 * the application's own services, which is usually what you came to look at.
 */
export const FRAMEWORK_SERVICES: ReadonlySet<string> = new Set([
  'App',
  'BaseLogger',
  'Container',
  'DefaultErrorHandlerProvider',
  'ErrorHandlerProvider',
  'GlobalMiddlewareRegistry',
  'HooksService',
  'HttpServer',
  'IntrospectionRegistry',
  'Logger',
  'MetadataResolver',
  'PluginsRegistry',
  'RequestContext',
  'RequestHandler',
  'Router',
  'RuntimeConfig',
  'StandardSchemaValidationProvider',
  'StaticRequestHandler',
  'TelemetryRegistry',
  'ValidationProvider',
]);

/**
 * Describes the dependency injection container.
 *
 * `@vercube/di` builds the graph; the roles are assigned here, because only the
 * framework layer knows what a controller or a middleware is.
 */
export class ContainerProvider implements IntrospectionTypes.Provider<Describe.ContainerDescription> {
  /** @inheritdoc */
  public readonly id = 'container';

  /** @inheritdoc */
  public readonly title = 'Container';

  @Inject(Container)
  private readonly gContainer!: Container;

  /** @inheritdoc */
  public revision(): number {
    return this.gContainer.revision;
  }

  /** @inheritdoc */
  public describe(): Describe.ContainerDescription {
    return describeContainer(this.gContainer, { annotate: annotateService });
  }
}

/**
 * Assigns a framework role to a container node.
 *
 * @param node - The node being described
 * @param context - The binding it was built from
 */
function annotateService(node: Describe.ServiceNode, context: Describe.AnnotateContext): void {
  const basePath = readControllerPath(context.ctor);

  if (basePath !== undefined) {
    node.role = 'controller';
    node.basePath = basePath;
    return;
  }

  const prototype = context.ctor?.prototype as Record<string, unknown> | undefined;

  if (prototype && (typeof prototype.onRequest === 'function' || typeof prototype.onResponse === 'function')) {
    node.role = 'middleware';
    return;
  }

  if (typeof context.ctor === 'function' && (context.ctor === BasePlugin || context.ctor.prototype instanceof BasePlugin)) {
    node.role = 'plugin';
    return;
  }

  if (FRAMEWORK_SERVICES.has(node.name)) {
    node.role = 'framework';
  }
}

/**
 * Reads the base path declared by `@Controller()`.
 *
 * @param ctor - Class constructor to inspect
 * @returns The base path, or undefined when the class is not a controller
 */
export function readControllerPath(ctor: (Function & { prototype: unknown }) | null): string | undefined {
  const metadata = (ctor?.prototype as { __metadata?: MetadataTypes.Ctx } | undefined)?.__metadata;

  return metadata?.__controller?.path;
}
