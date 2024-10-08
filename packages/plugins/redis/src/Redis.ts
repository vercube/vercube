import { BasePlugin } from '../../../core/src';
import type { App } from '../../../core/src';
import { Redis } from 'ioredis';

export interface RedisPluginOptions {
  port: number, // Redis port
  host: string, // Redis host
  username: string, // needs Redis >= 6
  password: string,
  db: number, // Defaults to 0
}

/**
 * CustomPlugin class that extends the Plugin class.
 */
export class RedisPlugin extends BasePlugin<RedisPluginOptions> {

  /**
   * The name of the plugin.
   * @override
   */
  public override name: string = 'Redis';

  /**
   * @private
   * @type {Redis | null}
   * @description Redis connection object. It is initially set to `null` and created on the first connection request.
   */
  private redis: Redis | null = null;

  /**
   * @private
   * @type {RedisPluginOptions | null}
   * @description Redis options object.
   */
  private options: RedisPluginOptions | null = null;

  /**
   * Method to use the plugin with the given app.
   *
   * @param {App} app - The application instance.
   * @param {RedisPluginOptions} options - The plugin custom options.
   * @returns {void | Promise<void>}
   * @override
   */
  public override use(app: App, options: RedisPluginOptions): void | Promise<void> {
    console.log('CustomPlugin is being used', options);
    this.options = options;
  }

  public getConnection(): Redis {
    if (!this.redis && this.options) {
        this.redis = new Redis(this.options);
        console.log('Connecting to Redis at:', this.options.host);
    }

    return this.redis;
  }

}
