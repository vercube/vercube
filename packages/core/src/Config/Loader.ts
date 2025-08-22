import { loadConfig, setupDotenv } from 'c12';
import { defu } from 'defu';
import { ConfigTypes } from '../Types/ConfigTypes';
import { defaultConfig } from './DefaultConfig';

/**
 * Loads the configuration object for the application
 * @param {ConfigTypes.Config} overrides - The configuration object to load
 * @returns {ConfigTypes.Config} The loaded configuration object
 */
export async function loadVercubeConfig(
  overrides?: ConfigTypes.Config,
): Promise<ConfigTypes.Config> {
  const config = await loadConfig<ConfigTypes.Config>({
    name: 'vercube',
    dotenv: overrides?.c12?.dotenv ?? true,
    rcFile: false,
    globalRc: false,
    defaults: defaultConfig,
  });

  // override dotenv
  if (
    config?.config?.c12?.dotenv &&
    typeof config?.config?.c12?.dotenv === 'object'
  ) {
    await setupDotenv(config.config.c12.dotenv);
  }

  return defu(overrides ?? {}, config?.config ?? {});
}
