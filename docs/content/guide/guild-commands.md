---
title: Guild Commands
---

# Guild Commands

By default, commands are registered globally. Global commands can take up to 1 hour to propagate across Discord. Guild commands update instantly, making them ideal for development and server-specific features.

## Marking Commands as Guild-Only

Add the `@guild` JSDoc tag:

```ts
/**
 * A development-only command
 * @guild
 */
export default () => 'This updates instantly!'
```

## Configuring Guild IDs

Guild commands need target guild IDs. Set them via environment variable:

```bash
# .env
DISCORD_GUILD_ID=123456789012345678
```

Multiple guilds (comma-separated):

```bash
DISCORD_GUILD_ID=123456789012345678,987654321098765432
```

Or in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  discord: {
    guilds: ['123456789012345678'],
  },
})
```

The environment variable takes precedence if no `guilds` are configured in `nuxt.config.ts`.

## How It Works

When commands are registered:

1. Commands **without** `@guild` are registered globally via `PUT /applications/{id}/commands`
2. Commands **with** `@guild` are registered to each configured guild via `PUT /applications/{id}/guilds/{guild_id}/commands`

If `@guild` commands exist but no guild IDs are configured, a warning is logged.

## Development Workflow

A common pattern is to use `@guild` during development for instant updates, then remove it before publishing:

```ts
/**
 * My new command (remove @guild before release)
 * @guild
 */
export default () => 'testing...'
```
