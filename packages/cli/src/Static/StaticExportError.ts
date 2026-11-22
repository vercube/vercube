/** Thrown when an export cannot go where it was told to. */
export class StaticExportError extends Error {
  public override name: string = 'StaticExportError';
}
