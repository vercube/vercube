import { ConfigTypes } from '../Types/ConfigTypes';

/**
 * Defines a configuration object for the application
 * @param {ConfigTypes.Config} config - The configuration object to validate
 * @returns {ConfigTypes.Config} The validated configuration object
 */
export function defineConfig<T = Record<string, unknown>>(config: ConfigTypes.Config<T>): ConfigTypes.Config<T> {
  return config;
}
