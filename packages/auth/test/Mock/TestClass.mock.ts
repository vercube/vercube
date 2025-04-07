import { Authorize, Authenticate } from '../../src';

export class TestClass {

  @Authorize({
    rules: ['admin'],
  })
  public testMethod() {}

}

@Authorize({
  rules: ['admin'],
})
export class TestClass2 {}

@Authenticate()
export class TestClass3 {}

export class TestClass4 {

  @Authenticate()
  public testMethod() {}

}
