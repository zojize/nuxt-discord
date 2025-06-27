/**
 * @name greet
 * @description Greet someone with a custom message
 * @param name The person to greet
 * @param style The greeting style
 */
export default (name: string, style: string) => {
  describeOption(name, {
    minLength: 1,
    maxLength: 32,
  })

  describeOption(style, {
    choices: [
      { name: 'Formal', value: 'formal' },
      { name: 'Casual', value: 'casual' },
      { name: 'Enthusiastic', value: 'enthusiastic' },
    ],
  })

  const greetings = {
    formal: `Good day, ${name}.`,
    casual: `Hey ${name}!`,
    enthusiastic: `HELLO THERE ${name.toUpperCase()}!!! 🎉`,
  } as const

  return greetings[style as keyof typeof greetings]
}
