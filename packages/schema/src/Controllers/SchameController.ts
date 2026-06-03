import { renderApiReference } from '@scalar/client-side-rendering';
import { Controller, Get } from '@vercube/core';
import { Inject } from '@vercube/di';
import { DEFAULT_SCHEMA_PLUGIN_OPTIONS } from '../Constants/SchemaDefaults';
import { SchemaRegistry } from '../Services/SchemaRegistry';
import { $SchemaPluginOptions } from '../Symbols/SchemaSymbols';
import type { SchemaPluginOptions, SchemaScalarOptions } from '../Types/SchemaPluginOptions';

/**
 * A controller for serving the generated OpenAPI schema and Scalar API Reference UI.
 *
 * @controller
 */
@Controller('/_schema')
export class SchemaController {
  @Inject(SchemaRegistry)
  private readonly gSchemaRegistry!: SchemaRegistry;

  @Inject($SchemaPluginOptions)
  private readonly gSchemaPluginOptions!: SchemaPluginOptions;

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
  public getDocs(): Response {
    if (this.gSchemaPluginOptions.scalar === false) {
      return new Response(null, { status: 404 });
    }

    const scalar: SchemaScalarOptions = {
      ...DEFAULT_SCHEMA_PLUGIN_OPTIONS.scalar,
      ...(typeof this.gSchemaPluginOptions.scalar === 'object' ? this.gSchemaPluginOptions.scalar : {}),
    };

    const html = renderApiReference({
      config: {
        url: scalar.openApiUrl ?? '/_schema/',
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
