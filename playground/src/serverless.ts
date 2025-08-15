import { createApp } from '@vercube/core';
import { toServerlessHandler } from '@vercube/serverless/aws-lambda';
import { useContainer } from './Boot/Container';
import { setup } from './Boot/Setup';
import type { ServerlessHandler } from '@vercube/serverless';

const app = await createApp({ setup });
app.container.expand(useContainer);

export const handler: ServerlessHandler = toServerlessHandler(app);