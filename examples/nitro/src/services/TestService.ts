import { Injectable } from '@vercube/di';

@Injectable()
export class TestService {
  public getTest(): string {
    return 'test';
  }
}
