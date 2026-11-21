export default (query: string) => {
  describeOption(query, {
    autocomplete: (value: string) => [{ name: `${value} result`, value }],
  })
  return query
}
