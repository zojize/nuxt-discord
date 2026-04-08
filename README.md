# <span style="color:oklch(72.3% 0.219 149.579)">Nuxt</span> <span style="color:#5865F2">Discord</span>

[![npm version][npm-version-src]][npm-version-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

A Nuxt module for building Discord bots with slash commands, featuring hot module replacement, automatic command registration, and a web interface for command management.

## Features

- **Slash Commands** - Type-safe definitions with automatic registration
- **Context Menus** - User and message context menus via `defineUserContextMenu` / `defineMessageContextMenu`
- **Event Listeners** - File-based listeners via `defineListener`
- **Middleware** - tRPC-inspired `next()` chain with `defineMiddleware`, `useMiddleware` macro, and `@middleware` JSDoc tags
- **Modals** - Interactive forms via `reply.modal(title, fields, onSubmit)`
- **File-based Routing** - Directory structure maps to subcommand hierarchy
- **All Option Types** - String, Number, Integer, Boolean, User, Role, Mentionable, Attachment
- **JSDoc Metadata** - `@nsfw`, `@guild`, `@dm`, `@defaultMemberPermissions`, `@middleware` tags
- **Localization** - i18n via inline JSDoc or `discord/locales/*.json` files
- **Guild Commands** - Register commands per-guild for instant updates
- **HMR** - Hot reload commands during development
- **Web Dashboard** - Overview, commands, context menus, listeners, and live activity log
- **Built-in Middleware** - `guildOnly`, `ownerOnly`, `cooldown`, `requireRole`

## Quick Setup

```bash
bun add nuxt-discord discord.js
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-discord'],
  discord: {
    autoStart: true,
    watch: {
      sync: { debounce: 1000 },
    },
  },
})
```

```bash
# .env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
```

## Creating Commands

Create files in `discord/commands/`:

```ts
// discord/commands/ping.ts

/** A simple ping command */
export default function ping() {
  return 'pong!'
}
```

The description is inferred from the JSDoc body text. Name priority: `describeCommand` macro > `@name` tag > function name > file name.

### Parameters

Types are inferred from TypeScript signatures:

```ts
// discord/commands/add.ts

/**
 * Adds two numbers together
 * @param a The first number
 * @param b The second number
 */
export default (a: number, b: number) => {
  describeOption(a, { min: -100, max: 100 })
  describeOption(b, { min: -100, max: 100 })
  return `${a} + ${b} = ${a + b}`
}
```

All Discord option types are supported:

```ts
export default (
  name: string, // String option
  count: number, // Number option
  sides: integer, // Integer option (phantom type)
  verbose: boolean, // Boolean option
  user: User, // User option
  role: Role, // Role option
  target: Mentionable, // Mentionable option
  file: Attachment, // Attachment option
) => { /* ... */ }
```

### Union Types as Choices

```ts
export default (color: 'red' | 'green' | 'blue') => {
  return `You picked ${color}`
}
```

### Subcommands

Directory structure maps to Discord's subcommand hierarchy:

```
discord/commands/
  channel.ts              # /channel (parent)
  channel/
    send.ts               # /channel send
    members.ts            # /channel members (group)
    members/
      count.ts            # /channel members count
      names.ts            # /channel members names
```

## Command Metadata

Use JSDoc tags to configure command properties:

```ts
/**
 * Admin-only moderation command
 * @nsfw
 * @guild
 * @dm false
 * @defaultMemberPermissions 8
 */
export default () => {
  return reply.ephemeral('Secret admin action!')
}
```

| Tag | Effect |
|---|---|
| `@nsfw` | Mark as age-restricted |
| `@guild` | Register to all configured guilds (instant updates) |
| `@guild <id>` | Register to a specific guild by ID |
| `@dm false` | Disable in DMs |
| `@defaultMemberPermissions <bits>` | Require permissions (e.g. `8` = Administrator) |
| `@name.<locale> <text>` | Inline localized name (e.g. `@name.ja ピング`) |
| `@description.<locale> <text>` | Inline localized description |

### Guild Commands

```ts
/** @guild */ // all configured guilds
/** @guild 123456789012345678 */ // specific guild
/**
 * @guild 111111111111111111
 * @guild 222222222222222222
 */ // multiple guilds
```

For bare `@guild`, configure target guilds via `DISCORD_GUILD_ID` env var or `discord.guilds` in nuxt.config.

## Localization

### Inline JSDoc

```ts
/**
 * A ping command
 * @name.ja ピング
 * @description.ja ポンと返すコマンド
 * @description.fr Renvoie pong
 */
export default () => 'pong!'
```

### JSON Locale Files

Create files in `discord/locales/` named after Discord locale codes:

```json
// discord/locales/ja.json
{
  "ping": {
    "name": "ピング",
    "description": "ポンと返すコマンド"
  },
  "add": {
    "description": "2つの数を足す",
    "options": {
      "a": { "description": "最初の数" }
    }
  }
}
```

Inline JSDoc tags take precedence over JSON files. Both can coexist.

## Response Types

```ts
// Simple string
export default () => 'Hello!'

// Ephemeral (only visible to user)
export default () => reply.ephemeral('Secret!')

// With files
export default () => reply.file('hello.txt').send('Here is your file')

// Reactive (auto-edits when ref changes)
export default () => {
  const msg = ref('Loading...')
  setTimeout(() => {
    msg.value = 'Done!'
  }, 2000)
  return msg
}

// Generator (multiple replies)
export default function* () {
  yield 'First message'
  yield 'Follow-up'
}

// Interactive buttons
export default () => {
  const count = ref(0)
  return reply
    .button('+1', () => { count.value++ })
    .send(computed(() => `Count: ${count.value}`))
}
```

## Middleware

```ts
// discord/commands/admin.ts

/** @middleware guildOnly */
export default () => {
  useMiddleware(cooldown, { seconds: 10 })
  return reply.ephemeral('Admin action executed!')
}
```

Built-in middleware: `guildOnly`, `ownerOnly`, `cooldown`, `requireRole`. Create your own with `defineMiddleware`:

```ts
export const withUser = defineMiddleware('withUser', async ({ interaction, next }) => {
  const user = await db.getUser(interaction.user.id)
  if (!user)
    throw new MiddlewareError('Please register first.')
  return next({ user }) // pass data to the command
})
```

## Web Dashboard

Access `/discord` to view:

- **Overview** - Stat cards for commands, context menus, listeners
- **Slash Commands** - Option types, sync status, one-click sync, command test bar with parameter autocomplete
- **Context Menus** - User and message menus grouped by type
- **Listeners** - Event names and once flags
- **Activity Log** - Real-time interaction history with filtering and stats

File paths link to your editor via `vscode://file` URLs.

## Runtime Hooks

```ts
// server/plugins/discord.ts
export default defineNitroPlugin(async (nitro) => {
  nitro.hooks.hook('discord:client:config', (options) => {
    options.presence = {
      status: 'online',
      activities: [{ name: 'Powered by Nuxt' }],
    }
  })

  nitro.hooks.hook('discord:client:ready', (client) => {
    console.log('Bot is ready!')
  })

  nitro.hooks.hook('discord:client:error', (error) => {
    console.error('Discord error:', error)
  })
})
```

## Server-side Client Access

```ts
export default async () => {
  const client = useDiscordClient()
  const guilds = client.internalClient?.guilds.cache.size || 0
  return `Bot is in ${guilds} servers!`
}
```

## Configuration

```ts
export default defineNuxtConfig({
  discord: {
    client: {
      intents: ['Guilds', 'GuildMessages'],
      deferOnPromise: true,
    },
    dir: 'discord',
    autoStart: true,
    guilds: [], // Guild IDs for @guild commands
    interactionTimeout: 15 * 60 * 1000, // scope cleanup (default: 15 min)
    watch: {
      enabled: true,
      port: 5720,
      showURL: false,
      sync: { debounce: 1000 },
    },
  },
})
```

## Contribution

```bash
bun install
bun run dev        # Start playground
bun run test       # Run tests
bun run lint       # Lint
bun run prepack    # Build module
```

Refer to the [Nuxt Module Author Guide](https://nuxt.com/docs/guide/going-further/modules).

## Acknowledgement

- Built with the [Nuxt module starter](https://github.com/nuxt/starter/tree/module)
- Inspired by [@nuxt/content](https://github.com/nuxt/content), [@nuxtjs/i18n](https://github.com/nuxt-modules/i18n), [@nuxt/devtools](https://github.com/nuxt/devtools)
- UI powered by [Nuxt UI](https://ui.nuxt.com/)

## License

[MIT](./LICENSE)

[npm-version-src]: https://img.shields.io/npm/v/nuxt-discord/latest.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-version-href]: https://npmjs.com/package/nuxt-discord

[license-src]: https://img.shields.io/github/license/zojize/nuxt-discord?style=flat&colorA=18181B&colorB=28CF8D
[license-href]: https://github.com/zojize/nuxt-discord/blob/main/LICENSE

[nuxt-src]: https://img.shields.io/badge/Nuxt-18181B?logo=nuxt.js
[nuxt-href]: https://nuxt.com
