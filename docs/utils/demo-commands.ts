export const playableNames = ['ping', 'add', 'reverse', 'greet']

export function demoSuggestions(command: string, option: string, text: string) {
  if (command !== 'greet' || option !== 'name')
    return []
  return ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve']
    .filter(name => name.toLowerCase().startsWith(text.toLowerCase()))
    .map(name => ({ name, value: name }))
}

export function runDemo({ name, options }: { name: string, options: Record<string, string> }) {
  switch (name) {
    case 'ping': return { ok: true, response: 'pong' }
    case 'reverse': return { ok: true, response: options.input!.split('').reverse().join('') }
    case 'greet': {
      const person = options.name!
      const greetings: Record<string, string> = {
        formal: `Good day, ${person}.`,
        casual: `Hey ${person}!`,
        enthusiastic: `HELLO THERE ${person.toUpperCase()}!!! 🎉`,
      }
      return { ok: true, response: greetings[options.style!] }
    }
    case 'add': {
      const a = Number(options.a)
      const b = Number(options.b)
      return { ok: true, ephemeral: true, response: `The sum of ${a} and ${b} is ${a + b}!` }
    }
    default: return { ok: false, error: 'Unknown command' }
  }
}
