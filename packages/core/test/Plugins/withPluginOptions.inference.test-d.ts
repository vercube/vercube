import { withPluginOptions } from '../../src/Plugins/VercubePlugin';
import { BasePlugin } from '../../src/Services/Plugins/BasePlugin';

interface Opt {
  externals?: string[];
}

class P extends BasePlugin<Opt> {
  public override name = 'p';
}

// @ts-expect-error externals must be string[], not string
const _bad = withPluginOptions(P, { externals: 'asd' });

const _ok = withPluginOptions(P, { externals: ['x'] });
