import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { InjectOptional } from '@vercube/di';
import { $SchemaPluginOptions } from '../Symbols/SchemaSymbols';
import type { SchemaPluginOptions } from '../Types/SchemaPluginOptions';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';

/**
 * Manages the OpenAPI schema registry and provides utilities to generate OpenAPI components
 * from registered Zod schemas using the @asteasolutions/zod-to-openapi library.
 *
 * This class is intended to be used for collecting and generating OpenAPI-compatible
 * schema definitions for API documentation and validation purposes.
 */
export class SchemaRegistry {
  @InjectOptional($SchemaPluginOptions)
  private readonly gSchemaPluginOptions?: SchemaPluginOptions;

  /**
   * Registered route configurations.
   * @private
   */
  private fRoutes: RouteConfig[] = [];

  /**
   * Bumped on every registration, so introspection can cache the generated
   * document and know when it went stale.
   * @private
   */
  private fRevision: number = 1;

  /**
   * Revision of the registry contents.
   * @returns The current revision.
   */
  public get revision(): number {
    return this.fRevision;
  }

  /**
   * Registers a route configuration with the registry.
   * @param cfg - The route configuration to register.
   */
  public register(cfg: RouteConfig): void {
    this.fRoutes.push(cfg);
    this.fRevision++;
  }

  /**
   * Generates the OpenAPI document. A fresh zod-to-openapi registry is built
   * on every call, so components from the plugin options are never
   * registered twice.
   *
   * @async
   * @returns {Promise<unknown>} A promise that resolves to the generated OpenAPI components object.
   */
  public async generateSchema(): Promise<ReturnType<OpenApiGeneratorV3['generateDocument']>> {
    const { document, components } = this.gSchemaPluginOptions ?? {};

    const registry = new OpenAPIRegistry();

    for (const [type, entries] of Object.entries(components ?? {})) {
      for (const [name, component] of Object.entries(entries ?? {})) {
        registry.registerComponent(type as any, name, component as any);
      }
    }

    for (const route of this.fRoutes) {
      registry.registerPath(route);
    }

    return new OpenApiGeneratorV3(registry.definitions).generateDocument({
      ...document,
      openapi: '3.0.0',
      info: {
        title: 'API',
        version: '1.0.0',
        ...document?.info,
      },
    });
  }
}
