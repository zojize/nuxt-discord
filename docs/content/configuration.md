---
title: Configuration
---

# Configuration

All options are set under the `discord` key in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['nuxt-discord'],
  discord: {
    client: {
      intents: ['Guilds', 'GuildMessages'],
      deferOnPromise: true,
    },
    dir: 'discord',
    autoStart: true,
    guilds: [],
    watch: {
      enabled: true,
      port: 5720,
      showURL: false,
      sync: {
        debounce: 1000,
      },
    },
  },
})
```

## Options

### `client`

Options passed to the Discord.js `Client` constructor.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `intents` | `GatewayIntentBits[]` | `['Guilds']` | Gateway intents for the bot |
| `deferOnPromise` | `boolean` | `true` | Auto-defer reply when command returns a promise |

Use the `discord:client:config` runtime hook for dynamic configuration like presence and activity.

### `dir`

- **Type:** `string`
- **Default:** `'discord'`

Directory containing command files and locales, relative to project root.

### `autoStart`

- **Type:** `boolean`
- **Default:** `true`

Whether to automatically connect the bot on server startup. Set to `false` if you want to start the bot manually via hooks.

### `guilds`

- **Type:** `string[]`
- **Default:** `[]`

Guild IDs for registering `@guild`-tagged commands. Can also be set via the `DISCORD_GUILD_ID` environment variable (comma-separated).

### `interactionTimeout`

- **Type:** `number`
- **Default:** Remaining Discord token lifetime (15 minutes minus elapsed time)

Timeout in milliseconds before an interaction's reactive scope is disposed. This cleans up Vue watchers (reactive replies) and button collectors. Set to `0` to disable automatic cleanup.

```ts
discord: {
  interactionTimeout: 5 * 60 * 1000 // 5 minutes
}
```

### `watch`

HMR and sync options for development.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Enable hot reload for commands |
| `port` | `number` | `5720` | WebSocket port for HMR |
| `showURL` | `boolean` | `false` | Show HMR server URL in console |
| `sync.debounce` | `number` | `1000` | Milliseconds to debounce before syncing after HMR |

Set `sync` to `false` to disable auto-sync entirely.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DISCORD_TOKEN` | Yes | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Yes | Application ID from Discord Developer Portal |
| `DISCORD_GUILD_ID` | No | Comma-separated guild IDs for guild commands |
| `DISCORD_OWNER_ID` | No | User ID for the `ownerOnly` middleware |
