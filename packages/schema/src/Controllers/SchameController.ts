import { Controller, Get } from "@vercube/core";
import { Inject } from "@vercube/di";
import { SchemaRegistry } from "../Services/SchemaRegistry";

/**
 * A controller for serving the generated OpenAPI schema.
 *
 * This controller exposes an endpoint to retrieve the OpenAPI schema
 * generated from registered route schemas.
 *
 * @controller
 */
@Controller('/_schema')
export class SchemaController {

  @Inject(SchemaRegistry)
  private readonly gSchemaRegistry: SchemaRegistry;

  /**
   * Handles GET requests to retrieve the generated OpenAPI schema.
   *
   * @returns {Promise<unknown>} The generated OpenAPI schema object.
   */
  @Get('/')
  public async get(): Promise<unknown> {
    return this.gSchemaRegistry.generateSchema();
  }

}