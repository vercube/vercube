import { useContainer } from '@/boot/Container';
import { type App, createApp, provideConfig } from '@vercube/core';
import { type NetlifyHandler, toServerlessHandler } from '@vercube/serverless/netlify';
import config from '../vercube.config';

// The function bundle does not carry `vercube.config.ts` as a file, so the
// configuration is imported and travels in the bundle.
provideConfig(config);

const app: App = await createApp();
app.container.expand(useContainer);

// only when this file is what was started: a Netlify Function imports it
if (import.meta.main) {
  await app.listen();
}

export const netlify: NetlifyHandler = toServerlessHandler(app);
