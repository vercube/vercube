import { type S3Client } from '@aws-sdk/client-s3';

 
export namespace S3StorageTypes {
  export interface BaseOptions extends Partial<S3Client> {
    region: string;
    bucket: string;
  }
}