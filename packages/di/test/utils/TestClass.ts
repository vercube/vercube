/**
 * Abstract class for IOC tests
 */
export abstract class ATestClass {}

/**
 * Simple class for IOC tests
 */
export default class TestClass extends ATestClass {

  /**
   * value
   */
  private fValue: number;

  /**
   * get value
   */
  public get value(): number {
    return this.fValue;
  }

  /**
   * increment value
   */
  public increment(): void {
    this.fValue++;
  }

}
