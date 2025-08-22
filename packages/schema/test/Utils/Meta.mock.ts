import { z } from '../../src';
import type { MetadataTypes } from '@vercube/core';

export const MetaMock: MetadataTypes.Method = {
  req: null,
  res: null,
  method: 'GET',
  url: '/mock',
  actions: [],
  args: [
    {
      idx: 0,
      type: 'body',
      validate: true,
      validationSchema: z.object({
        name: z.string(),
      }),
    },
    {
      idx: 1,
      type: 'query-params',
      validate: true,
      validationSchema: z.object({
        name: z.string(),
      }),
    },
  ],
  meta: {},
};
