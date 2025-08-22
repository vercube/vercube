import { OpenAPIRegistry, OpenApiGeneratorV3, type RouteConfig } from '@asteasolutions/zod-to-openapi';

/**
 * Manages the OpenAPI schema registry and provides utilities to generate OpenAPI components
 * from registered Zod schemas using the @asteasolutions/zod-to-openapi library.
 *
 * This class is intended to be used for collecting and generating OpenAPI-compatible
 * schema definitions for API documentation and validation purposes.
 */
export class SchemaRegistry {
  /**
   * Internal registry instance for storing OpenAPI schema definitions.
   * @private
   */
  private fRegistry: OpenAPIRegistry = new OpenAPIRegistry();

  /**
   * Registers a route configuration with the registry.
   * @param cfg - The route configuration to register.
   */
  public register(cfg: RouteConfig): void {
    this.fRegistry.registerPath(cfg);
  }

  /**
   * Generates OpenAPI components from the registered schemas.
   *
   * @async
   * @returns {Promise<unknown>} A promise that resolves to the generated OpenAPI components object.
   */
  public async generateSchema(): Promise<ReturnType<OpenApiGeneratorV3['generateDocument']>> {
    return new OpenApiGeneratorV3(this.fRegistry.definitions).generateDocument({
      openapi: '3.0.0',
      info: {
        title: 'API',
        version: '1.0.0',
      },
    });
  }
}
