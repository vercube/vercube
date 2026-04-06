import { BasePlugin } from '@vercube/core';
import { PluginInfoCommand } from '../Commands/PluginInfoCommand';
import { HealthController } from '../Controllers/HealthController';
import type { App, ConfigTypes, VercubePluginCliContext } from '@vercube/core';

export interface HealthPluginOptions {
  /** Extra Rolldown `external` entries (illustrates `configure`). */
  externals?: string[];
}

export class HealthPlugin extends BasePlugin<HealthPluginOptions> {
  public override name = 'HealthPlugin';

  public override configure(_config: ConfigTypes.Config, options?: HealthPluginOptions) {
    const extra = options?.externals ?? [];
    if (extra.length === 0) {
      return;
    }
    return {
      build: {
        rolldownConfig: {
          external: extra,
        },
      },
    };
  }

  public override setup(app: App): void {
    app.container.bind(HealthController);
  }

  public override setupCLI(ctx: VercubePluginCliContext): void {
    ctx.register(PluginInfoCommand);
  }
}
