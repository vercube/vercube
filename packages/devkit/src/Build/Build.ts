import { DevKitTypes } from '../Support/DevKitTypes';
import { getBundler, getBundlerConfig } from '../Utils/Utils';

/**
 * Builds the application using the given application instance.
 * @param {DevKitTypes.App} app - The application instance.
 * @returns {Promise<void>} A promise that resolves when the build is complete.
 */
export async function build(app: DevKitTypes.App): Promise<void> {

  const config = await getBundlerConfig(app.config);
  const bundler = getBundler(app.config?.build?.bundler ?? 'rolldown');

  const build = await bundler({ ...config } as any satisfies Parameters<typeof bundler>[0]).catch((error) => {
    throw error;
  });

  await build.write(config.output as any);

}