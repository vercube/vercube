/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NodeEventContext } from 'h3';
export namespace MetadataTypes {

  export type Request = NodeEventContext['req'];

  export type Response = NodeEventContext['res'];

  export interface Metadata {
    req: Request | null;
    res: Response | null;
    args: Arg[];
    actions: Action[];
  }

  export interface ResolvedData {
    req: Request | null;
    res: Response | null;
    args: unknown[];
    actions: Action[];
  }

  export interface Arg {
    idx: number;
    type: string;
    data?: Record<string, any>;
  }

  export interface Action {
    handler: (req: Request, res: Response) => void;
  }

}