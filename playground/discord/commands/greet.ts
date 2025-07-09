/**
 * @name greet
 * @description Greet someone with a custom message
 * @param name The person to greet
 * @param style The greeting style
 */
export default (name: string, style: 'formal' | 'casual' | 'enthusiastic') => {
  describeOption(name, {
    minLength: 1,
    maxLength: 32,
  })

  const greetings = {
    formal: `Good day, ${name}.`,
    casual: `Hey ${name}!`,
    enthusiastic: `HELLO THERE ${name.toUpperCase()}!!! 🎉`,
  } as const

  return greetings[style]
}
