/* eslint-disable @typescript-eslint/no-explicit-any */
export namespace MetadataTypes {

  export interface Metadata {
    args: Arg[];
  }

  export interface ResolvedData {
    args: unknown[];
  }

  export interface Arg {
    idx: number;
    type: string;
    data?: Record<string, any>;
  }

}