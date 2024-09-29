export function Controller(path: string): Function {
  return function internalDecorator(ctx: Function) {
    ctx.prototype.__metadata = {
      controller: {
        path,
      },
    }
  }
}