import { renderApiReference } from '@scalar/client-side-rendering';
import { Controller, Get, Middleware } from '@vercube/core';
import { Inject } from '@vercube/di';
import { DEFAULT_SCHEMA_PATH, DEFAULT_SCHEMA_PLUGIN_OPTIONS } from '../Constants/SchemaDefaults';
import { SchemaAuthMiddleware } from '../Middleware/SchemaAuthMiddleware';
import { SchemaRegistry } from '../Services/SchemaRegistry';
import { $SchemaPluginOptions } from '../Symbols/SchemaSymbols';
import type { SchemaResolvedOptions, SchemaScalarOptions } from '../Types/SchemaPluginOptions';

/**
 * A controller for serving the generated OpenAPI schema and Scalar API Reference UI.
 * Mounted at the plugin's `path`, which replaces the one declared here.
 *
 * @controller
 */
@Controller(DEFAULT_SCHEMA_PATH)
@Middleware(SchemaAuthMiddleware, { priority: -1000 })
export class SchemaController {
  @Inject(SchemaRegistry)
  private readonly gSchemaRegistry!: SchemaRegistry;

  @Inject($SchemaPluginOptions)
  private readonly gSchemaPluginOptions!: SchemaResolvedOptions;

  /**
   * Handles GET requests to retrieve the generated OpenAPI schema.
   *
   * @returns {Promise<unknown>} The generated OpenAPI schema object.
   */
  @Get('/')
  public async get(): Promise<unknown> {
    return this.gSchemaRegistry.generateSchema();
  }

  /**
   * Serves the Scalar API Reference UI for the generated OpenAPI schema.
   *
   * @see https://github.com/scalar/scalar
   */
  @Get('/docs')
  public async getDocs(): Promise<Response> {
    const options = this.gSchemaPluginOptions;

    if (options.scalar === false) {
      return new Response(null, { status: 404 });
    }

    const scalar: SchemaScalarOptions = {
      ...DEFAULT_SCHEMA_PLUGIN_OPTIONS.scalar,
      ...(typeof options.scalar === 'object' ? options.scalar : {}),
    };

    // Behind a token the browser cannot fetch the document on its own, so the
    // page carries it, unless it was pointed somewhere else on purpose.
    const source =
      options.token && !scalar.openApiUrl
        ? { content: await this.gSchemaRegistry.generateSchema() }
        : { url: scalar.openApiUrl ?? `${options.path}/` };

    const html = renderApiReference({
      config: {
        ...source,
        ...scalar.config,
      },
      pageTitle: scalar.pageTitle,
      cdn: scalar.cdn,
    });

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}
