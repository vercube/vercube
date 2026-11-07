import { defineRecipe } from '../Apply';
import { VERSIONS } from './Versions';

const CONTROLLER = `import { Body, Controller, Get, Param, Put } from '@vercube/core';
import { Inject } from '@vercube/di';
import { StorageManager } from '@vercube/storage';

/**
 * curl -X PUT localhost:3000/api/files/hello -H 'content-type: application/json' -d '{"text":"hi"}'
 * curl localhost:3000/api/files/hello
 */
@Controller('/api/files')
export default class FilesController {
  @Inject(StorageManager)
  private gStorage!: StorageManager;

  @Put('/:key')
  public async write(@Param('key') key: string, @Body() body: unknown): Promise<{ ok: true }> {
    await this.gStorage.setItem({ key, value: body });

    return { ok: true };
  }

  @Get('/:key')
  public async read(@Param('key') key: string): Promise<{ key: string; value: unknown }> {
    return { key, value: await this.gStorage.getItem({ key }) };
  }
}
`;

export const storageRecipe = defineRecipe<{ driver: string }>({
  id: 'storage',
  label: 'Storage',
  hint: 'key-value storage, memory or S3',
  prompts: [
    {
      name: 'driver',
      flag: 'storage',
      message: 'Storage driver?',
      default: 'memory',
      options: [
        { value: 'memory', label: 'Memory', hint: 'nothing to run, lost on restart' },
        { value: 's3', label: 'S3', hint: 'AWS S3 or a compatible service' },
      ],
    },
  ],
  apply: ({ project, answers }) => {
    project.addDependencies({ '@vercube/storage': 'latest' });
    project.createFile('src/controller/FilesController.ts', CONTROLLER);
    project.bind({ name: 'StorageManager', from: '@vercube/storage' });

    if (answers.driver === 's3') {
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
