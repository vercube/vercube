import { defineRecipe } from '../Apply';
import { useApiKeyGuard, useRedis } from './Services';
import { VERSIONS } from './Versions';

const CONTROLLER = `import { BadRequestError, Body, Controller, Get, Header, Param, Put } from '@vercube/core';
import { Inject } from '@vercube/di';
import { StorageManager } from '@vercube/storage';
import { requireApiKey } from '@/services/ApiKeyGuard';

const KEY = /^[\\w-]{1,64}$/;

function storageKey(key: string): string {
  if (!KEY.test(key)) {
    throw new BadRequestError('Invalid key');
  }

  return \`examples/\${key}\`;
}

/**
 * Example only: add real auth before deploying. Requests need the API_KEY of
 * .env in an x-api-key header, and keys are limited to letters, digits, \`-\`
 * and \`_\`, stored under \`examples/\`.
 *
 * curl -X PUT localhost:3000/api/files/hello -H "x-api-key: <API_KEY from .env>" -H 'content-type: application/json' -d '{"text":"hi"}'
 * curl localhost:3000/api/files/hello -H "x-api-key: <API_KEY from .env>"
 */
@Controller('/api/files')
export default class FilesController {
  @Inject(StorageManager)
  private gStorage!: StorageManager;

  @Put('/:key')
  public async write(
    @Param('key') key: string,
    @Body() body: unknown,
    @Header('x-api-key') apiKey?: string,
  ): Promise<{ ok: true }> {
    requireApiKey(apiKey);
    await this.gStorage.setItem({ key: storageKey(key), value: body });

    return { ok: true };
  }

  @Get('/:key')
  public async read(
    @Param('key') key: string,
    @Header('x-api-key') apiKey?: string,
  ): Promise<{ key: string; value: unknown }> {
    requireApiKey(apiKey);

    return { key, value: await this.gStorage.getItem({ key: storageKey(key) }) };
  }
}
`;

export const storageRecipe = defineRecipe<{ driver: string }>({
  id: 'storage',
  label: 'Storage',
  hint: 'key-value storage, memory, Redis or S3',
  prompts: [
    {
      name: 'driver',
      flag: 'storage',
      message: 'Storage driver?',
      default: 'memory',
      options: [
        { value: 'memory', label: 'Memory', hint: 'nothing to run, lost on restart' },
        { value: 'redis', label: 'Redis', hint: 'shared by every instance, needs Redis' },
        { value: 's3', label: 'S3', hint: 'AWS S3 or a compatible service' },
      ],
    },
  ],
  apply: ({ project, answers }) => {
    project.addDependencies({ '@vercube/storage': 'latest' });
    useApiKeyGuard(project);
    project.note('FilesController is an example guarded by API_KEY: add real auth before deploying');
    project.createFile('src/controller/FilesController.ts', CONTROLLER);
    project.bind({ name: 'StorageManager', from: '@vercube/storage' });

    if (answers.driver === 'redis') {
      project.addDependencies({ ioredis: VERSIONS.ioredis });
      useRedis(project);
      project.addToContainer(
        `void container.get(StorageManager).mount({
          storage: RedisStorage,
          initOptions: { url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379' },
        });`,
        { StorageManager: '@vercube/storage', RedisStorage: '@vercube/storage/drivers/RedisStorage' },
      );
      // an open Redis connection keeps the process alive after SIGTERM or Ctrl-C
      project.setConfig('shutdown', '{ handleSignals: true }');
    } else if (answers.driver === 's3') {
      project.addDependencies({ '@aws-sdk/client-s3': VERSIONS.awsSdkS3 });
      project.addToContainer(
        `void container.get(StorageManager).mount({
          storage: S3Storage,
          initOptions: {
            bucket: process.env.S3_BUCKET || 'uploads',
            region: process.env.AWS_REGION || 'us-east-1',
            endpoint: process.env.S3_ENDPOINT || undefined,
            forcePathStyle: !!process.env.S3_ENDPOINT,
          },
        });`,
        { StorageManager: '@vercube/storage', S3Storage: '@vercube/storage/drivers/S3Storage' },
      );
      project.addEnv(
        { S3_BUCKET: 'uploads', AWS_REGION: 'us-east-1', S3_ENDPOINT: '', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '' },
        'Storage (S3): leave S3_ENDPOINT empty for AWS, set it for MinIO or another compatible service',
      );
      project.note('Set the S3_* and AWS_* variables in .env before starting');
    } else {
      project.addToContainer('void container.get(StorageManager).mount({ storage: MemoryStorage });', {
        StorageManager: '@vercube/storage',
        MemoryStorage: '@vercube/storage/drivers/MemoryStorage',
      });
    }

    project.bind({ name: 'FilesController', from: '@/controller/FilesController', default: true });
  },
});
