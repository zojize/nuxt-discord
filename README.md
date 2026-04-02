# <span style="color:oklch(72.3% 0.219 149.579)">Nuxt</span> <span style="color:#5865F2">Discord</span>

[![npm version][npm-version-src]][npm-version-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

A Nuxt module for building Discord bots with slash commands, featuring hot module replacement, automatic command registration, and a web interface for command management.

## Features

- **Slash Commands** - Type-safe definitions with automatic registration
- **File-based Routing** - Directory structure maps to subcommand hierarchy
- **All Option Types** - String, Number, Integer, Boolean, User, Role, Mentionable, Attachment
- **JSDoc Metadata** - `@nsfw`, `@guild`, `@dm`, `@defaultMemberPermissions` tags
- **Localization** - i18n via `discord/locales/*.json` files
- **Guild Commands** - Register commands per-guild for instant updates
- **HMR** - Hot reload commands during development
- **Web Dashboard** - View commands, sync status, and register with one click

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
| `@guild` | Register to guilds only (instant updates) |
| `@dm false` | Disable in DMs |
| `@defaultMemberPermissions <bits>` | Require permissions (e.g. `8` = Administrator) |

### Guild Commands

Commands tagged with `@guild` register to specific guilds instead of globally. Guild commands update instantly (vs up to 1 hour for global).

Configure guild IDs via environment variable:

```bash
DISCORD_GUILD_ID=123456789,987654321
```

Or in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  discord: {
    guilds: ['123456789', '987654321'],
  },
})
```

## Localization

Create JSON files in `discord/locales/` named after Discord locale codes:

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
      "a": { "description": "最初の数" },
      "b": { "description": "2番目の数" }
    }
  }
}
```

Valid locale codes: `ja`, `zh-CN`, `zh-TW`, `ko`, `fr`, `de`, `es-ES`, `pt-BR`, `ru`, `uk`, `pl`, `nl`, `it`, `sv-SE`, `no`, `da`, `fi`, `hu`, `cs`, `ro`, `el`, `bg`, `th`, `vi`, `hi`, `tr`, `id`, `en-US`, `en-GB`, and [more](https://discord.com/developers/docs/reference#locales).

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

## Web Dashboard

Access `/discord/slash-commands` to view:

- All registered commands with option types and constraints
- Sync status (synced, added, changed, removed, conflict)
- Command metadata (nsfw, guild-only, permissions)
- One-click sync to Discord

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
