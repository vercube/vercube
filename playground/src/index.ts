import { type App, createApp } from '@vercube/core';
import { useContainer } from './Boot/Container';
import { setup } from './Boot/Setup';

const app: App = await createApp({ setup });
app.container.expand(useContainer);

await app.listen();

export default app;
