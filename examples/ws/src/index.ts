import { useContainer } from '@/boot/Container';
import { setup } from '@/boot/Setup';
import { createApp } from '@vercube/core';

async function main() {
  const app = await createApp({ setup });

  app.container.expand(useContainer);

  await app.listen();
}

await main();
