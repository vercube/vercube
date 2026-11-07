import { defineRecipe } from '../Apply';
import { VERSIONS } from './Versions';

export const telemetryRecipe = defineRecipe({
  id: 'telemetry',
  label: 'Telemetry',
  hint: 'OpenTelemetry traces and metrics',
  apply: ({ project }) => {
    // loaded by startNodeTelemetry() as soon as an endpoint is set
    project.addDependencies({
      '@vercube/telemetry': 'latest',
      '@opentelemetry/exporter-trace-otlp-http': VERSIONS.otlpTraceExporter,
    });
    project.addPlugin({ name: 'TelemetryPlugin', from: '@vercube/telemetry' });
    // createApp() loads .env, which is too late for telemetry started before it
    project.addToEntry(
      `try {
        process.loadEnvFile();
      } catch {
        // no .env, the environment is set some other way
      }`,
      { position: 'before-create-app' },
    );
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
