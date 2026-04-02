/**
 * @description Adds two numbers
 * @param a First number
 * @param b Second number
 */
export default (a: number, b: number) => {
  describeOption(a, { min: 0, max: 100 })
  describeOption(b, { min: 0, max: 100 })
  return `${a + b}`
}
