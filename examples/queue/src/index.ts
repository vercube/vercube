import { useContainer } from '@/boot/Container';
import { setup } from '@/boot/Setup';
import { createApp, type App, type RequestHandler } from '@vercube/core';

const app: App = await createApp({ setup });
app.container.expand(useContainer);

if (import.meta.main) {
  await app.listen();
}

export default {
  fetch: app.fetch.bind(app) as RequestHandler,
};
