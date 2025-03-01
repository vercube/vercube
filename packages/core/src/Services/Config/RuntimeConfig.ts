import { ConfigTypes } from '../../Types/ConfigTypes';

/**
 * RuntimeConfig class manages the runtime configuration for the Vercube application.
 * This class provides a centralized way to access and modify runtime configuration settings.
 */
export class RuntimeConfig {
  /**
   * Private field to store the runtime configuration object.
   * @private
   */
  private fRuntimeConfig: ConfigTypes.RuntimeConfig;
  
  /**
   * Gets the current runtime configuration.
   * @returns {ConfigTypes.RuntimeConfig} The current runtime configuration object.
   */
  public get runtimeConfig(): ConfigTypes.RuntimeConfig {
    return this.fRuntimeConfig;
  }

  /**
   * Sets the runtime configuration.
   * @param {ConfigTypes.RuntimeConfig} value - The new runtime configuration object to set.
   */
  public set runtimeConfig(value: ConfigTypes.RuntimeConfig) {
    this.fRuntimeConfig = value;
  }
}