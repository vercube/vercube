import { useContainer } from '@/boot/Container';
import { createApp } from '@vercube/core';

const app = await createApp();
app.container.expand(useContainer);

if (import.meta.main) {
  await app.listen();
}

export default {
  fetch: app.fetch.bind(app),
};
