import { useContainer } from '@/boot/Container';
import { type App, createApp, provideConfig } from '@vercube/core';
import { type CloudflareHandler, toServerlessHandler } from '@vercube/serverless/cloudflare';
import config from '../vercube.config';

// A Worker has no file system to read `vercube.config.ts` from at run time,
// so the configuration is imported and travels in the bundle.
provideConfig(config);

const app: App = await createApp();
app.container.expand(useContainer);

// `vercube dev` needs it, and it binds nothing on Workers
await app.listen();

// Cloudflare runs the default export of the module.
const worker: CloudflareHandler = toServerlessHandler(app);

export default worker;
