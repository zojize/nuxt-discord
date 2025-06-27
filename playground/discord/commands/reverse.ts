export default function reverse(input: string) {
  describeCommand({
    name: 'reverse',
    description: 'Reverses the input string!',
  })

  describeOption(input, {
    description: 'The string that you want to reverse',
  })

  return input.split('').reverse().join('')
}
