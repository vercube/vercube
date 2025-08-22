import { type App } from '@vercube/core';
import { type EventHandler, type H3Event } from 'h3';

/**
 * Converts a Vercube application to an H3 event handler
 * 
 * This adapter allows Vercube applications to be integrated with H3 servers by converting
 * the Vercube request handling pipeline into an H3-compatible event handler.
 * 
 * @param {App} app - The Vercube application instance to adapt
 * @returns {EventHandler} An H3 event handler that processes requests through the Vercube app
 * 
 * @example
 * ```ts
 * import { createApp } from '@vercube/core'
 * import { toH3 } from '@vercube/h3'
 * import { H3 } from 'h3'
 * 
 * const h3app = new H3()
 * const app = await createApp()
 * 
 * // Mount Vercube app at /api path
 * h3app.all('/api/**', toH3(app))
 * ```
 */

export function toH3(app: App): EventHandler {
  return (event: H3Event) => app.fetch(event.req);
}