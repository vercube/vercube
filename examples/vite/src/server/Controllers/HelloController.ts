import { Controller, Get, Param } from '@vercube/core';

@Controller('/api/hello')
export default class HelloController {
  @Get('/')
  public index(): { message: string } {
    return { message: 'Hello from Vercube + Vite!' };
  }

  @Get('/:name')
  public greet(@Param('name') name: string): { message: string } {
    return { message: `Hello, ${name}!` };
  }
}
