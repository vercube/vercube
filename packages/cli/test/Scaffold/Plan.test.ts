import { describe, expect, it, vi } from 'vitest';
import { defineRecipe } from '../../src/Recipes/Apply';
import { parseList, resolveInitPlan } from '../../src/Scaffold/Plan';
import type { InitInput, Prompter } from '../../src/Scaffold/Plan';

const templates = [
  { id: 'api', label: 'API only', registryName: 'vercube' },
  { id: 'fullstack-vue', label: 'Fullstack: Vercube + Vue', registryName: 'fullstack-vue' },
];

const recipes = [
  defineRecipe({ id: 'schema', label: 'Schema', apply: () => {} }),
  defineRecipe({
    id: 'queue',
    label: 'Queue',
    prompts: [
      {
        name: 'driver',
        flag: 'queue',
        message: 'Queue driver?',
        default: 'bullmq',
        options: [
          { value: 'bullmq', label: 'BullMQ' },
          { value: 'rabbitmq', label: 'RabbitMQ' },
        ],
      },
    ],
    apply: () => {},
  }),
  defineRecipe({ id: 'testing', label: 'Testing', apply: () => {} }),
  defineRecipe({ id: 'devtools', label: 'Devtools', apply: () => {} }),
  defineRecipe({ id: 'aws-lambda', label: 'AWS Lambda', kind: 'deploy', apply: () => {} }),
];

const input = (overrides: Partial<InitInput> = {}): InitInput => ({ flags: {}, yes: false, interactive: false, ...overrides });

const noPrompts: Prompter = {
  text: () => Promise.reject(new Error('asked')),
  select: () => Promise.reject(new Error('asked')),
  multiselect: () => Promise.reject(new Error('asked')),
};

const plan = (overrides: Partial<InitInput>, prompter: Prompter = noPrompts, pm?: string) =>
  resolveInitPlan(input(overrides), { templates, recipes }, prompter, pm);

describe('resolveInitPlan', () => {
  it('should take everything from flags without asking', async () => {
    const result = await plan({
      dir: 'my-app',
      template: 'fullstack-vue',
      modules: 'schema,queue',
      flags: { queue: 'rabbitmq' },
      deploy: 'aws-lambda',
      packageManager: 'npm',
    });

    expect(result).toMatchObject({
      dir: 'my-app',
      template: { id: 'fullstack-vue' },
      modules: ['schema', 'queue'],
      deploy: 'aws-lambda',
      packageManager: 'npm',
      answers: { schema: {}, queue: { driver: 'rabbitmq' }, 'aws-lambda': {} },
    });
  });

  it('should take the defaults with --yes', async () => {
    const result = await plan({ yes: true }, noPrompts, 'bun');

    expect(result).toMatchObject({
      dir: 'vercube-app',
      template: { id: 'api' },
      modules: ['schema', 'testing', 'devtools'],
      deploy: 'node',
      packageManager: 'bun',
    });
  });

  it('should list every missing flag without a terminal', async () => {
    await expect(plan({ dir: 'x', modules: 'queue' })).rejects.toThrow(
      'Missing --template, --queue, --deploy, --package-manager. Pass them, or --yes for the defaults',
    );
  });

  it('should ask what flags did not answer', async () => {
    const prompter: Prompter = {
      text: vi.fn(async () => 'asked-dir'),
      select: vi.fn(async (message: string) => ({ 'Queue driver?': 'rabbitmq', 'Package manager?': 'yarn' })[message] ?? 'api'),
      multiselect: vi.fn(async () => ['queue']),
    };

    const result = await plan({ interactive: true, deploy: 'node' }, prompter);

    expect(result).toMatchObject({
      dir: 'asked-dir',
      modules: ['queue'],
      answers: { queue: { driver: 'rabbitmq' } },
      packageManager: 'yarn',
    });
    expect(prompter.multiselect).toHaveBeenCalledWith('Which modules do you want?', expect.any(Array), [
      'schema',
      'testing',
      'devtools',
    ]);
  });

  it('should create a bare project with --modules none', async () => {
    expect((await plan({ yes: true, modules: 'none' })).modules).toEqual([]);
  });

  it.each([
    [{ template: 'fullstack-react' }, 'Unknown template "fullstack-react". Available: api, fullstack-vue.'],
    [{ modules: 'queue,nope' }, 'Unknown module: nope. Available: schema, queue, testing, devtools.'],
    [{ modules: 'queue', flags: { queue: 'sqs' } }, '--queue must be one of bullmq, rabbitmq, got sqs.'],
    [{ deploy: 'heroku' }, 'Unknown deploy target "heroku". Available: node, aws-lambda.'],
    [{ packageManager: 'pip' }, 'Unknown package manager "pip"'],
    [{ packageManager: 'deno', template: 'fullstack-vue' }, 'Deno supports the api template only'],
  ] as [Partial<InitInput>, string][])('should refuse %j', async (overrides, message) => {
    await expect(plan({ yes: true, ...overrides })).rejects.toThrow(message);
  });
});

describe('parseList', () => {
  it('should split, trim, dedupe and read none as empty', () => {
    expect(parseList(' schema, queue,,schema ')).toEqual(['schema', 'queue']);
    expect(parseList('none')).toEqual([]);
    expect(parseList('')).toEqual([]);
  });
});
