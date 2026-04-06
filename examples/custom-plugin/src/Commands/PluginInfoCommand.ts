import { BaseCommand, Command } from '@vercube/cli/toolkit';

@Command({
  name: 'plugin-info',
  description: 'Print where this CLI command was registered (via HealthPlugin.setupCLI)',
})
export class PluginInfoCommand extends BaseCommand {
  public override async run(): Promise<void> {
    console.log('Registered from HealthPlugin.setupCLI - see examples/custom-plugin');
  }
}
