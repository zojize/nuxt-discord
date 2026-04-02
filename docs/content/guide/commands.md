---
title: Commands
---

# Commands

Commands are TypeScript files in the `discord/commands/` directory. Each file exports a function that becomes a slash command.

## Basic Command

```ts
// discord/commands/ping.ts

/** Responds with pong */
export default () => 'pong!'
```

The command name is inferred from the file name. The description comes from the JSDoc body text.

## Name Resolution

The command name is resolved in this order:

1. `describeCommand` macro (`name` field)
2. `@name` JSDoc tag
3. Function name (for named exports)
4. File name

```ts
// All of these produce a command named "greet":

// Via @name tag
/** @name greet */
export default () => 'hello'

// Via function name
export default function greet() {
  return 'hello'
}

// Via describeCommand macro
export default () => {
  describeCommand({ name: 'greet', description: 'Say hello' })
  return 'hello'
}
```

## Description

The description is resolved in this order:

1. `describeCommand` macro (`description` field)
2. `@description` JSDoc tag
3. JSDoc body text (the comment before any tags)

```ts
// Body text as description (recommended)
/** Say hello to someone */
export default () => 'hello'

// @description tag
/**
 * @description Say hello to someone
 */
export default () => 'hello'
```

## Command Metadata

Use JSDoc tags to set Discord command properties:

```ts
/**
 * A restricted admin command
 * @nsfw
 * @guild
 * @dm false
 * @defaultMemberPermissions 8
 */
export default () => reply.ephemeral('admin action')
```

| Tag | Effect |
| --- | --- |
| `@nsfw` | Mark as age-restricted |
| `@guild` | Register per-guild instead of globally |
| `@dm false` | Disable in direct messages |
| `@defaultMemberPermissions <bits>` | Require permissions (e.g., `8` = Administrator) |

## Using `defineSlashCommand`

For explicit typing, wrap your function in `defineSlashCommand`:

```ts
export default defineSlashCommand((name: string) => {
  return `Hello ${name}!`
})
```

This provides better IDE support and type checking for the command function.
