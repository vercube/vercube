import type { ConfigTypes } from '../../Types/ConfigTypes';

/**
 * RuntimeConfig class manages the runtime configuration for the Vercube application.
 * This class provides a centralized way to access and modify runtime configuration settings.
 */
export class RuntimeConfig<T = Record<string, unknown>> {
  /**
   * Private field to store the runtime configuration object.
   * @private
   */
  private fRuntimeConfig: ConfigTypes.CreateRuntimeConfig<T> | undefined;

  /**
   * Bumped on every assignment, so introspection can cache a rendered view of
   * the configuration and know when it went stale.
   * @private
   */
  private fRevision: number = 1;

  /**
   * Revision of the runtime configuration.
   * @returns {number} The current revision.
   */
  public get revision(): number {
    return this.fRevision;
  }

  /**
   * Gets the current runtime configuration.
   * @returns {ConfigTypes.CreateRuntimeConfig<T> | undefined} The current runtime configuration object.
   */
  public get runtimeConfig(): ConfigTypes.CreateRuntimeConfig<T> | undefined {
    return this.fRuntimeConfig;
  }

  /**
   * Sets the runtime configuration.
   * @param {ConfigTypes.CreateRuntimeConfig<T>} value - The new runtime configuration object to set.
   */
  public set runtimeConfig(value: ConfigTypes.CreateRuntimeConfig<T> | undefined) {
    this.fRuntimeConfig = value;
    this.fRevision++;
  }
}
