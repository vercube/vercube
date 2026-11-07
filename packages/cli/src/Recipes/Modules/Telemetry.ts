import { defineRecipe } from '../Apply';

export const telemetryRecipe = defineRecipe({
  id: 'telemetry',
  label: 'Telemetry',
  hint: 'OpenTelemetry traces and metrics',
  apply: ({ project }) => {
    project.addDependencies({ '@vercube/telemetry': 'latest' });
    project.addPlugin({ name: 'TelemetryPlugin', from: '@vercube/telemetry' });
    // before createApp(), so the bootstrap is traced too; exports nothing until an endpoint is set
    project.addToEntry(
      "await startNodeTelemetry({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'api', endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT });",
      { position: 'before-create-app', imports: { startNodeTelemetry: '@vercube/telemetry/sdk' } },
    );
    project.addEnv(
      { OTEL_SERVICE_NAME: 'api', OTEL_EXPORTER_OTLP_ENDPOINT: '' },
      'Telemetry: set the endpoint of an OTLP collector to export',
    );
  },
});
