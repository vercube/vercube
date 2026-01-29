import { createApp } from '@vercube/core';
import { useContainer } from './Boot/Container';
import { setup } from './Boot/Setup';

const app = await createApp({ setup });
app.container.expand(useContainer);

if (import.meta.main) {
  await app.listen();
}

export default {
  fetch: app.fetch.bind(app),
};
