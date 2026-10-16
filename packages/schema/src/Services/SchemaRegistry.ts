import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { MetadataResolver } from '@vercube/core';
import { InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { $SchemaPluginOptions } from '../Symbols/SchemaSymbols';
import { createRouteConfig } from '../Utils/RouteConfig';
import type { SchemaPluginOptions } from '../Types/SchemaPluginOptions';
import type { SchemaRouteOptions } from '../Utils/RouteConfig';
import type { MetadataTypes } from '@vercube/core';

/**
 * A controller method documented with `@Schema`.
 */
export interface SchemaEntry {
  /** Prototype of the controller that holds the method metadata. */
  prototype: object;
  /** Name of the method. */
  propertyName: string;
  /** Options passed to `@Schema`. */
  options: SchemaRouteOptions;
}

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

  @InjectOptional(Logger)
  private readonly gLogger?: Logger | null;

  @InjectOptional(MetadataResolver)
  private readonly gMetadataResolver?: MetadataResolver | null;

  /**
   * Documented methods, keyed by prototype and method name, so a controller
   * initialized again replaces its entries instead of duplicating them.
   * @private
   */
  private fEntries: Map<object, Map<string, SchemaRouteOptions>> = new Map();

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
   * Adds a documented method. The route config is not built here: the route
   * decorator of the same method may not have filled its metadata yet.
   * @param entry - The documented method.
   */
  public add(entry: SchemaEntry): void {
    const methods = this.fEntries.get(entry.prototype) ?? new Map<string, SchemaRouteOptions>();

    methods.set(entry.propertyName, entry.options);
    this.fEntries.set(entry.prototype, methods);
    this.fRevision++;
  }

  /**
   * Generates the OpenAPI document. Route configs are built from the method
   * metadata at this point, when every decorator has already run.
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

    const config = {
      ...document,
      openapi: '3.0.0',
      info: {
        title: 'API',
        version: '1.0.0',
        ...document?.info,
      },
    } as const;

    // the components alone, so a route can be generated in isolation against them
    const componentDefinitions = [...registry.definitions];

    for (const [prototype, methods] of this.fEntries) {
      const metadata = (prototype as { __metadata?: MetadataTypes.Ctx }).__metadata;

      for (const [propertyName, options] of methods) {
        const name = `${prototype.constructor?.name ?? 'Controller'}.${propertyName}`;
        const warn = (message: string): void => this.gLogger?.warn('SchemaRegistry', `${name}: ${message}`);

        // One broken route must not take the whole document down with it, so
        // every route is generated on its own first and skipped if that fails.
        try {
          const controller = (prototype as { constructor?: Function }).constructor;
          const controllerPath = controller ? this.gMetadataResolver?.getControllerPath(controller) : undefined;
          const route = createRouteConfig(metadata?.__methods?.[propertyName], options, warn, controllerPath);

          if (!route) {
            continue;
          }

          new OpenApiGeneratorV3([...componentDefinitions, { type: 'route', route }]).generateDocument(config);
          registry.registerPath(route);
        } catch (error) {
          warn(`the route is left out of the schema, ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return withoutNullableParameters(new OpenApiGeneratorV3(registry.definitions).generateDocument(config));
  }
}

/**
 * Drops `nullable` from parameter schemas. zod-to-openapi marks every
 * `z.coerce.*` schema nullable, as its input is `unknown`, but a query, path or
 * header parameter is a string or absent, never `null`.
 *
 * @param document - The generated document.
 * @returns The same document.
 */
function withoutNullableParameters<T extends { paths?: Record<string, Record<string, any>> }>(document: T): T {
  for (const operations of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(operations ?? {})) {
      for (const parameter of operation?.parameters ?? []) {
        if (parameter?.schema && 'nullable' in parameter.schema) {
          delete parameter.schema.nullable;
        }
      }
    }
  }

  return document;
}
