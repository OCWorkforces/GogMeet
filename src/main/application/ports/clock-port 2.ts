/** Injectable clock for join target / schedule tests. */
export interface ClockPort {
  now(): number;
}
