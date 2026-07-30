import { RuntimeConfig } from '@vercube/core';
import { Inject, InjectOptional } from '@vercube/di';
import { $DevtoolsAppConfig } from '../Symbols/DevtoolsSymbols';
import { flattenConfig } from '../Utils/Flatten';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';
import type { ConfigTypes } from '@vercube/core';

/**
 * Reports the configuration the application actually resolved.
 */
export class ConfigCollector {
  @Inject($DevtoolsAppConfig)
  private readonly gAppConfig!: ConfigTypes.Config;

  @InjectOptional(RuntimeConfig)
  private readonly gRuntime!: RuntimeConfig | null;

  /**
   * Flattens both configuration surfaces.
   * @returns the application config and the runtime config, as dotted paths
   */
  public collect(): DevtoolsTypes.ConfigView {
    return {
      app: flattenConfig(this.gAppConfig),
      runtime: flattenConfig(this.gRuntime?.runtimeConfig ?? null),
    };
  }
}
