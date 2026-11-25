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

Startup, hot reload and the dashboard use the same guild configuration. The dashboard reports the result for each registration scope. A bare `@guild` without a target is reported as a configuration error. Guild registrations are preserved until the missing targets are configured. Global registration can still proceed. Discord distinguishes same-named global and guild commands by their registration scope, even when both are invoked from the same server.

With `watch.sync` enabled, edits to names, options and other registered metadata update Discord after the configured debounce. Editing only the handler keeps the existing registration. Removing the last command from a previously managed scope clears its registration. Nuxt Discord records managed scopes per application ID in Nitro’s `data` storage mount. Use persistent storage there to retain this history across deployments.

## Existing bots

Sync uses Discord's bulk overwrite endpoint. The module owns the full command list in every scope it manages, including user and message context menus. An existing command in that scope is removed if it is absent from the local definitions. When introducing the module to a bot with existing commands, set `discord.watch.sync` to `false` until the local definitions cover the commands you want to keep. [Discord registration endpoints](https://docs.discord.com/developers/interactions/application-commands#bulk-overwrite-global-application-commands)
