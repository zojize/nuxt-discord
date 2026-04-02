---
title: Guild Commands
---

# Guild Commands

By default, commands are registered globally. Global commands can take up to 1 hour to propagate across Discord. Guild commands update instantly, making them ideal for development and server-specific features.

## `@guild` Tag

### All Configured Guilds

A bare `@guild` tag registers the command to all guilds configured in `nuxt.config.ts` or `DISCORD_GUILD_ID`:

```ts
/**
 * A development-only command
 * @guild
 */
export default () => 'This updates instantly!'
```

### Specific Guild

Pass a guild ID directly in the tag — no global config needed:

```ts
/**
 * Only for my test server
 * @guild 123456789012345678
 */
export default () => 'test server only'
```

### Multiple Guilds

Use multiple `@guild` tags:

```ts
/**
 * For two specific servers
 * @guild 123456789012345678
 * @guild 987654321098765432
 */
export default () => 'two servers'
```

## Global Guild Config

For bare `@guild` commands (no ID specified), configure target guilds via environment variable:

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

## How It Works

When commands are registered:

1. Commands **without** `@guild` are registered globally
2. Commands with `@guild <id>` are registered to those specific guilds
3. Commands with bare `@guild` are registered to all configured guilds
4. Each guild receives only the commands targeting it

If bare `@guild` commands exist but no guild IDs are configured, a warning is logged.
