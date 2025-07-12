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
    autocomplete: (value: string) => {
      const names = ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve']
      return names.filter(n => n.toLowerCase().startsWith(value.toLowerCase()))
        .map(n => ({ name: n, value: n }))
    },
  })

  const greetings = {
    formal: `Good day, ${name}.`,
    casual: `Hey ${name}!`,
    enthusiastic: `HELLO THERE ${name.toUpperCase()}!!! 🎉`,
  }

  return greetings[style]
}
