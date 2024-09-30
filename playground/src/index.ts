import { createApp } from '@cube/core';
import { useContainer } from './Boot/Container';

async function main() {
  const app = await createApp();

  app.container.expand(useContainer);

  await app.listen({ port: 3001 });
}

main();