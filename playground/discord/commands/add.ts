/**
 * @name add
 * @description Adds two numbers together
 * @param a The first number to add
 * @param b The second number to add
 */
export default defineSlashCommand((a: number, b: number) => {
  describeOption(a, {
    min: -100,
    max: 100,
  })

  describeOption(b, {
    min: -100,
    max: 100,
  })

  return reply.ephemeral(`The sum of ${a} and ${b} is ${a + b}!`)
})
