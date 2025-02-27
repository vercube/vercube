import { DevKitTypes } from '../Support/DevKitTypes';
import { getBundlerConfig } from '../Utils/Utils';
import { rolldown, type RolldownOptions, type OutputOptions } from 'rolldown';

/**
 * Builds the application using the given application instance.
 * @param {DevKitTypes.App} app - The application instance.
 * @returns {Promise<void>} A promise that resolves when the build is complete.
 */
export async function build(app: DevKitTypes.App): Promise<void> {

  const config = await getBundlerConfig('rolldown') as RolldownOptions; // as default for now

  const build = await rolldown({ ...config }).catch((error) => {
    throw error;
  });

  await build.write(config.output as OutputOptions);

}