import { createApp } from '@vercube/core';
import { toServerlessHandler } from '@vercube/serverless/aws-lambda';
import type { ServerlessHandler } from '@vercube/serverless';
import { useContainer } from './Boot/Container';
import { setup } from './Boot/Setup';

const app = await createApp({ setup });
app.container.expand(useContainer);

export const handler: ServerlessHandler = toServerlessHandler(app);
