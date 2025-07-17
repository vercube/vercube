import { type ServerPlugin } from 'srvx';

/**
 * Server Plugins for registering plugins into the Http server
 * 
 * This class is responsible for:
 * - Registering server plugins that will be applied to the Http server
 */
export class ServerPlugins {
  private fServerPlugins: ServerPlugin[] = [];

  /**
   * Registers a new server plugin that will be applied to the Http server
   */
  public registerPlugin(plugin: ServerPlugin): void {
    this.fServerPlugins.push(plugin);
  }

  /**
   * Gets all registered server plugins
   * 
   * @returns {ServerPlugin[]}
   */
  get serverPlugins(): ServerPlugin[] {
    return this.fServerPlugins;
  }
}