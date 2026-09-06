import { InjectOptional } from '@vercube/di';
import { flattenConfig } from '../../../Utils/Flatten';
import { RuntimeConfig } from '../../Config/RuntimeConfig';
import type { ConfigTypes } from '../../../Types/ConfigTypes';
import type { IntrospectionTypes } from '../../../Types/IntrospectionTypes';

/**
 * Describes the merged application configuration.
 *
 * Values whose key names a credential are withheld: a config panel is one of
 * the easiest places to leak a token into a screenshot or a bug report.
 */
export class ConfigProvider implements IntrospectionTypes.Provider<IntrospectionTypes.ConfigDescription> {
  /** @inheritdoc */
  public readonly id = 'config';

  /** @inheritdoc */
  public readonly title = 'Configuration';

  /** The merged configuration, minus the runtime slice. */
  private fConfig: ConfigTypes.Config = {};

  @InjectOptional(RuntimeConfig)
  private readonly gRuntimeConfig!: RuntimeConfig | null;

  /**
   * Supplies the configuration to describe.
   *
   * @param config - The merged application configuration
   */
  public setConfig(config: ConfigTypes.Config): void {
    this.fConfig = config;
  }

  /** @inheritdoc */
  public revision(): number {
    return this.gRuntimeConfig?.revision ?? 1;
  }

  /** @inheritdoc */
  public describe(): IntrospectionTypes.ConfigDescription {
    return {
      app: flattenConfig({ ...this.fConfig, runtime: undefined }),
      runtime: flattenConfig(this.gRuntimeConfig?.runtimeConfig ?? null),
    };
  }
}
