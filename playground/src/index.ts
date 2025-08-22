import { createApp } from '@vercube/core';
import { useContainer } from './Boot/Container';
import { setup } from './Boot/Setup';

const app = await createApp({ setup });
app.container.expand(useContainer);

await app.listen();
