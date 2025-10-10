import { createApp } from '@vercube/core';
import { useContainer } from '@/boot/Container';
import { setup } from '@/boot/Setup';

async function main() {
  const app = await createApp({ setup });

  app.container.expand(useContainer);

  await app.listen();
}

await main();
