import { defineConfig } from '@vercube/core';
import { EvlogPlugin } from '@vercube/evlog';

/**
 * Vercube config with evlog integration.
 *
 * EvlogPlugin replaces the default console logger with evlog's structured
 * wide-event logger, and registers a global middleware that attaches a
 * per-request logger to every incoming request.
 *
 * In a real app, uncomment the `drain` option and point it at your
 * logging backend (Axiom, Loki, Grafana Cloud, etc.).
 */
export default defineConfig({
  logLevel: 'debug',
  server: {
    port: 3000,
  },
  plugins: [
    [
      EvlogPlugin,
      {
        // Routes to skip — health checks don't need a wide-event log
        exclude: ['/health'],

        provider: {
          // Pretty-print in dev; remove (or set false) in production
          pretty: true,

          // Uncomment to ship logs to an external backend:
          // drain: async ({ event, request }) => {
          //   await fetch('https://api.axiom.co/v1/datasets/my-app/ingest', {
          //     method: 'POST',
          //     headers: {
          //       Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
          //       'Content-Type': 'application/json',
          //     },
          //     body: JSON.stringify([event]),
          //   });
          // },
        },
      },
    ],
  ],
});
