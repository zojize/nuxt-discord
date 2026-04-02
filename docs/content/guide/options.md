---
title: Option Types
---

# Option Types

Parameter types are inferred from TypeScript type annotations. All Discord slash command option types are supported.

## Supported Types

```ts
export default (
  name: string,
  count: number,
  sides: integer,
  verbose: boolean,
  user: User,
  role: Role,
  target: Mentionable,
  file: Attachment,
) => {
  // ...
}
```

| TypeScript Type | Discord Option Type | Label |
| --- | --- | --- |
| `string` | String | `str` |
| `number` | Number | `num` |
| `integer` | Integer | `int` |
| `boolean` | Boolean | `bool` |
| `User` | User | `user` |
| `Role` | Role | `role` |
| `Mentionable` | Mentionable | `@` |
| `Attachment` | Attachment | `file` |

The `integer` type is a phantom type exported by nuxt-discord that maps to Discord's Integer option type (whole numbers only).

## Parameter Descriptions

Use `@param` JSDoc tags:

```ts
/**
 * Add two numbers
 * @param a The first number
 * @param b The second number
 */
export default (a: number, b: number) => {
  return `${a + b}`
}
```

## Optional Parameters

Use TypeScript's `?` syntax:

```ts
/**
 * @param message The message to send
 * @param loud Whether to shout
 */
export default (message: string, loud?: boolean) => {
  return loud ? message.toUpperCase() : message
}
```

Optional parameters are not marked as `required` in Discord.

## Constraints with `describeOption`

Use the `describeOption` macro to add validation:

```ts
export default (a: number, b: number) => {
  describeOption(a, { min: -100, max: 100 })
  describeOption(b, { min: -100, max: 100 })
  return `${a + b}`
}
```

### String Constraints

```ts
export default (name: string) => {
  describeOption(name, {
    minLength: 1,
    maxLength: 32,
  })
  return `Hello ${name}`
}
```

### Choices

```ts
export default (style: string) => {
  describeOption(style, {
    choices: [
      { name: 'Formal', value: 'formal' },
      { name: 'Casual', value: 'casual' },
    ],
  })
  return `Style: ${style}`
}
```

Alternatively, use union types for automatic choices:

```ts
export default (color: 'red' | 'green' | 'blue') => {
  return `You picked ${color}`
}
```

### Autocomplete

```ts
export default (query: string) => {
  describeOption(query, {
    autocomplete(value) {
      const items = ['apple', 'banana', 'cherry']
      return items
        .filter(i => i.startsWith(value))
        .map(i => ({ name: i, value: i }))
    },
  })
  return `Searching for ${query}`
}
```
