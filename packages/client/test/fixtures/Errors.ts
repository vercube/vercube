import { HttpError } from '@vercube/core';

/** A custom error with a literal name and a field of its own. */
export class ConflictError extends HttpError {
  public static readonly status: number = 409;

  public override name = 'ConflictError' as const;

  public constructor(public readonly existingId: string) {
    super(409, 'Already exists');
  }
}
