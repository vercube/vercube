/**
 * Generate random hash
 * @returns string
 */
export default function generateRandomHash(): string {
  const hashByPerformance = Math.floor(Date.now() * 1000).toString(16);

  const hashByMath = (): string => (Math.floor(Math.random() * 0xff_ff_ff) | 0x10_00_00).toString(16);
  return `${hashByPerformance}-${hashByMath()}-${hashByMath()}-${hashByMath()}`;
}
