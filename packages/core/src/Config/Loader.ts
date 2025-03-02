import { loadConfig }  from 'c12';
import { defu } from 'defu';
import { ConfigTypes } from '../Types/ConfigTypes';
import { defaultConfig } from './DefaultConfig';

/**
 * Loads the configuration object for the application
 * @param {ConfigTypes.Config} overrides - The configuration object to load
 * @returns {ConfigTypes.Config} The loaded configuration object
 */
export async function loadVercubeConfig(overrides?: ConfigTypes.Config): Promise<ConfigTypes.Config> {
  const config = await loadConfig<ConfigTypes.Config>({
    name: 'vercube',
    dotenv: true,
    rcFile: false,
    globalRc: false,
    defaults: defaultConfig,
  });

  return defu(overrides ?? {}, config?.config ?? {});
}