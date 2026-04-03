import { VercubeMiddleware } from '@/middleware/VercubeMiddleware';
import { Controller, Delete, Get, Middleware, Param, Post, Put } from '@vercube/core';
import { Inject } from '@vercube/di';
import { StorageManager } from '@vercube/storage';
import { TestService } from '../services/TestService';

/**
 * Foo controller.
 * This is a sample controller that demonstrates how to create a controller using the @vercube/core package.
 */
@Controller('/api/foo')
export class FooController {
  @Inject(StorageManager)
  private gStorageManager: StorageManager;

  @Inject(TestService)
  private gTestService: TestService;

  /**
   * Handles GET requests to the / endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/')
  @Middleware(VercubeMiddleware)
  public async index(): Promise<{ message: string }> {
    await this.gStorageManager.setItem({ key: 'foo', value: 'bar' });

    const value = await this.gStorageManager.getItem<string>({ key: 'foo' });

    return { message: `Hello, world! The value is ${value}` };
  }

  @Get('/:id')
  public async show(@Param('id') id: string): Promise<{ message: string }> {
    return {
      message: `Hello, world! The id is ${id} and the test service is ${this.gTestService.getTest()}`,
    };
  }

  @Post('/:id')
  public async create(@Param('id') id: string): Promise<{ message: string }> {
    return {
      message: `Hello, world! The id is ${id} and the test service is ${this.gTestService.getTest()}`,
    };
  }

  @Put('/:id')
  public async update(@Param('id') id: string): Promise<{ message: string }> {
    return {
      message: `Hello, world! The id is ${id} and the test service is ${this.gTestService.getTest()}`,
    };
  }

  @Delete('/:id')
  public async delete(@Param('id') id: string): Promise<{ message: string }> {
    return {
      message: `Hello, world! The id is ${id} and the test service is ${this.gTestService.getTest()}`,
    };
  }
}
