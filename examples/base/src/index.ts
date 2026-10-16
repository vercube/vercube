import { useContainer } from '@/boot/Container';
import { type App, createApp, type RequestHandler } from '@vercube/core';

const app: App = await createApp();
app.container.expand(useContainer);

await app.listen();

export default {
  fetch: app.fetch.bind(app) as RequestHandler,
};
