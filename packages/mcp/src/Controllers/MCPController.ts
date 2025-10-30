import { Connect, Controller, Delete, Get, Head, NotFoundError, Options, Patch, Post, Put, Request, Trace } from '@vercube/core';
import { Inject } from '@vercube/di';
import { MCPHttpHandler } from '../Services/MCPHttpHandler';

/**
 * Controller for handling all HTTP methods related to the MCP API routes.
 * Each decorated method handles the associated HTTP verb for any request path under '/api/mcp'.
 */
@Controller('/api/mcp')
export class MCPController {
  /**
   * The HTTP handler service responsible for processing incoming requests.
   */
  @Inject(MCPHttpHandler)
  private readonly gHttpHandler!: MCPHttpHandler;

  /**
   * Handles all HTTP methods for any route under '/api/mcp'.
   * Forwards the request to MCPHttpHandler and returns its response if available.
   * Otherwise, responds with a 404 Not Found.
   *
   * @param {Request} request - The incoming HTTP request.
   * @returns {Promise<Response>} The response from the handler or a 404 response.
   */
  @Get('/**')
  @Post('/**')
  @Put('/**')
  @Patch('/**')
  @Delete('/**')
  @Options('/**')
  @Head('/**')
  @Trace('/**')
  @Connect('/**')
  public async handle(@Request() request: Request): Promise<Response> {
    const response = await this.gHttpHandler.handleRequest(request);

    if (response) {
      return response;
    }

    throw new NotFoundError('Route not found');
  }
}
