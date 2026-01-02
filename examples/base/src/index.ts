import { useContainer } from '@/boot/Container';
import { createApp } from '@vercube/core';

async function main() {
  const app = await createApp();

  app.container.expand(useContainer);

  await app.listen();
}

await main();
