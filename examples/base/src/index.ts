import { createApp } from '@vercube/core';
import { useContainer } from '@/boot/Container';

async function main() {
  const app = await createApp();

  app.container.expand(useContainer);

  await app.listen();
}

await main();
