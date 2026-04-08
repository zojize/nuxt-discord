---
title: Middleware
---

# Middleware

Middleware runs before commands and context menus execute. Use it for permission checks, rate limiting, data loading, and any shared pre-processing.

## Defining Middleware

Use `defineMiddleware` to create reusable middleware. Each middleware receives the interaction and a `next()` function — call `next()` to continue, or throw `MiddlewareError` to deny.

```ts
// discord/middleware/betaOnly.ts
export const betaOnly = defineMiddleware('betaOnly', async ({ interaction, next }) => {
  const user = await db.getUser(interaction.user.id)
  if (!user?.isBeta)
    throw new MiddlewareError('This feature is in beta.')
  return next({ user }) // pass data to the command
})
```

## Attaching to Commands

### Via `useMiddleware` Macro

The primary way — works like `describeOption`:

```ts
export default defineSlashCommand(() => {
  useMiddleware(guildOnly)
  useMiddleware(cooldown, { seconds: 5 })
  return reply('Hello from a guarded command!')
})
```

### Via JSDoc

For simple guards that don't need options:

```ts
/** @middleware guildOnly */
/** @middleware ownerOnly */
export default defineSlashCommand(() => reply('admin action'))
```

### On Context Menus

Via JSDoc (same as commands):

```ts
/** @middleware guildOnly */
export default defineUserContextMenu('Admin Info', (interaction) => {
  return reply.ephemeral(`Info about ${interaction.targetUser.displayName}`)
})
```

Or via options:

```ts
export default defineUserContextMenu('Admin Info', handler, {
  middleware: [ownerOnly, guildOnly],
})
```

## Passing Context

Middleware can pass data to downstream middleware and the command handler via `next()`:

```ts
export const withUser = defineMiddleware('withUser', async ({ interaction, next }) => {
  const user = await db.getUser(interaction.user.id)
  if (!user)
    throw new MiddlewareError('Please register first.')
  return next({ user })
})
```

Access in the command with `useMiddlewareContext()`:

```ts
export default defineSlashCommand(() => {
  useMiddleware(withUser)
  const { user } = useMiddlewareContext<{ user: DBUser }>()
  return reply(`Hello, ${user.name}!`)
})
```

## Denying Execution

Throw `MiddlewareError` to deny. The bot replies with an ephemeral message showing the reason:

```ts
export const adminOnly = defineMiddleware('adminOnly', ({ interaction, next }) => {
  if (!interaction.memberPermissions?.has('Administrator'))
    throw new MiddlewareError('You need admin permissions.')
  return next()
})
```

## Built-in Middleware

Four middleware ship with the framework:

### `guildOnly`

Denies commands in DMs:

```ts
useMiddleware(guildOnly)
// or: @middleware guildOnly
```

### `ownerOnly`

Restricts to the bot owner (set `DISCORD_OWNER_ID` env var):

```ts
useMiddleware(ownerOnly)
// or: @middleware ownerOnly
```

### `cooldown`

Rate limits per user (default), guild, or channel:

```ts
useMiddleware(cooldown, { seconds: 10 })
useMiddleware(cooldown, { seconds: 30, scope: 'guild' })
useMiddleware(cooldown, { seconds: 5, scope: 'channel' })
```

### `requireRole`

Requires the user to have a specific role:

```ts
useMiddleware(requireRole, { roleId: '123456789' })
useMiddleware(requireRole, { roleId: ['123', '456'] }) // any of these roles
```

## Execution Order

1. Global hooks (`discord:interaction:before`)
2. Per-command middleware (top-to-bottom order)
3. Command handler

Middleware chains nest like tRPC — each wraps the next:

```
middleware1 → middleware2 → middleware3 → command.execute()
```

## Global Hooks

Use Nitro hooks for cross-cutting concerns:

```ts
// server/plugins/audit.ts
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('discord:interaction:before', (ctx) => {
    console.log(`${ctx.type}: ${ctx.interaction.user.displayName}`)
  })

  nitro.hooks.hook('discord:interaction:denied', (ctx) => {
    console.warn(`Denied by ${ctx.middleware}: ${ctx.reason}`)
  })
})
```

## Autocomplete

Middleware does **not** run on autocomplete interactions to avoid confusing UX where autocomplete works but execution fails.
