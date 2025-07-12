# <span style="color:oklch(72.3% 0.219 149.579)">Nuxt</span> <span style="color:#5865F2">Discord</span>

[![npm version][npm-version-src]][npm-version-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

A Nuxt module for building Discord bots with slash commands, featuring hot module replacement, automatic command registration, and web interface for command management.

## Features

- 🤖 **Discord Bot Integration** - Seamlessly integrate Discord.js with your Nuxt application
- ⚡ **Slash Commands** - Type-safe slash command definitions with automatic registration
- 🎯 **Auto-sync** - Automatically sync commands with Discord's servers
- 🖥️ **Web Interface** - Beautiful UI for managing and viewing slash commands
- 🔄 **Real-time Updates** - WebSocket-based live updates in development

## Quick Setup

Install the module to your Nuxt application:

```bash
pnpm install nuxt-discord discord.js
```

Add the module to your `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['nuxt-discord'],
  discord: {
    // Discord bot configuration
    client: {
      intents: ['Guilds'], // Discord gateway intents
      deferOnPromise: true, // Auto-defer interactions when command returns a promise
    },
    dir: 'discord', // Directory for Discord-related files
    autoStart: true, // Auto-start the bot on server startup
    watch: {
      enabled: true, // Enable HMR for commands
      port: 5720, // HMR server port
      showURL: false, // Show HMR server URL in console
      sync: {
        debounce: 1000 // Sync delay in milliseconds
      }
    }
  }
})
```

Set up your environment variables:

```bash
# .env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_id_here
```

## Creating Slash Commands

Create slash commands in the `/discord/commands` directory:

```ts
// discord/commands/ping.ts
/**
 * @name ping
 * @description A simple ping command that responds with 'pong!'
 */
export default function ping() {
  return 'pong!'
}
```

Defining a command this way this module automatically deduces the name and description from the JSDoc comments. The command name is inferred following this set of priorities: `describeCommand` macro > `@name` JSDoc tag > function name > file name.

### Commands with Parameters

```ts
// discord/commands/add.ts
/**
 * @name add
 * @description Adds two numbers together
 * @param a The first number to add
 * @param b The second number to add
 */
export default (a: number, b: number) => {
  // Add parameter validation
  describeOption(a, {
    min: -100,
    max: 100,
  })

  describeOption(b, {
    min: -100,
    max: 100,
  })

  return `The sum of ${a} and ${b} is ${a + b}!`
}
```

### String Parameters with Choices

```ts
// discord/commands/greet.ts
/**
 * @name greet
 * @description Greet someone with a custom message
 * @param name The person to greet
 * @param style The greeting style
 */
export default (name: string, style: string) => {
  describeOption(name, {
    minLength: 1,
    maxLength: 32,
  })

  describeOption(style, {
    choices: [
      { name: 'Formal', value: 'formal' },
      { name: 'Casual', value: 'casual' },
      { name: 'Enthusiastic', value: 'enthusiastic' },
    ],
  })

  const greetings = {
    formal: `Good day, ${name}.`,
    casual: `Hey ${name}!`,
    enthusiastic: `HELLO THERE ${name.toUpperCase()}!!! 🎉`,
  } as const

  return greetings[style as keyof typeof greetings]
}
```

## Web Interface

Access the command management interface at `/discord/slash-commands` in your application. The interface provides:

- 📋 **Command Overview** - View all registered commands with their parameters
- 🏷️ **Parameter Details** - See type information, validation rules, and constraints
- 🔄 **Sync Commands** - Monitor local commands' synced status with server
- ➕ **Register Commands** - Easily register newly added commands
- ⚡ **Live Updates** - Real-time updates during development

> **Coming Soon:** Live command execution/testing, i18n support, logging dashboard, and more fine-grained client control

## Advanced Usage & Customization

The module is highly customizable and provides access to the internal Discord client and runtime hooks for advanced use cases.

### Using the Discord Client in Server

```ts
import { useDiscordClient } from '#imports'

export default async () => {
  const client = useDiscordClient()

  // Access the internal Discord.js client
  const discordJS = client.internalClient
  const guilds = discordJS?.guilds.cache.size || 0

  return `Bot is in ${guilds} servers!`
}
```

### Runtime Hooks

The module provides several hooks for customizing bot behavior:

```ts
// nitro/plugins/discord-config.ts
export default defineNitroPlugin(async (nitro) => {
  // Configure Discord client options
  nitro.hooks.hook('discord:client:config', (options) => {
    options.presence = {
      status: 'online',
      activities: [{
        name: 'Powered by Nuxt',
      }]
    }
  })

  // Handle client ready event
  nitro.hooks.hook('discord:client:ready', (client) => {
    console.log('Discord bot is ready!')
  })

  // Handle client errors
  nitro.hooks.hook('discord:client:error', (error) => {
    console.error('Discord error:', error)
  })
})
```

### Custom Response Handling

```ts
export default (message: string) => {
  // Return different response types
  return reply.ephemeral(`This is private: ${message}`) // Only visible to user
  // or
  return `Public response: ${message}` // Visible to everyone
}
```

> Refer to [/src/types.ts](/src/types.ts) for detailed type definitions for how you can define commands return types for advanced behavior.

## Configuration Options

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  discord: {
    client: {
      intents: [
        'Guilds',
        'GuildMessages'
      ],
      deferOnPromise: true, // Auto-defer interactions when command returns a promise
    },
    dir: 'discord',
    autoStart: true,
    watch: {
      enabled: true,
      port: 5720, // HMR server port
      showURL: false, // Show HMR server URL in console
      sync: {
        debounce: 1000
      }
    }
  }
})
```

> Use the 'nitro:client:config' hook to configure other options passed to the Discord client.

## Roadmap

Here's what's planned for future releases:

### Core Features

- [ ] Full slash command options support
  - [x] String type
  - [x] Number type
  - [x] Integer type
  - [x] Boolean type
  - [ ] Role type
  - [ ] User type
  - [ ] Mentionable type
  - [ ] Attachment type
- [ ] Better JSDocs support JSDoc comments
- [ ] Localization support
- [ ] File-based subcommands
- [x] Auto-complete API
- [ ] Guild-specific commands
- [ ] Nuxt-devtools integration
- [ ] Unit tests

### Web Interface Enhancements

- [ ] Live command execution
- [ ] Command testing interface
- [ ] i18n management
- [ ] Logging dashboard
- [ ] Detailed client control panel
- [ ] Command analytics
- [ ] Fine grained diff display

## Contribution

Refer to the official [Module Author Guide](https://nuxt.com/docs/guide/going-further/modules)

## Acknowledgement

- Generated from the [module starter template](https://github.com/nuxt/starter/tree/module)
- Implementation details and best practices are inspired by
  - [@nuxt/content](https://github.com/nuxt/content)
  - [@nuxtjs/i18n](https://github.com/nuxt-modules/i18n)
  - [@nuxt/devtools](https://github.com/nuxt/devtools)
- UI components are based on [Nuxt UI](https://ui.nuxt.com/) and [UnoCSS](https://unocss.dev/)

## License

[MIT](./LICENSE) - Made with 💚

[npm-version-src]: https://img.shields.io/npm/v/nuxt-discord/latest.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-version-href]: https://npmjs.com/package/nuxt-discord

[license-src]: https://img.shields.io/github/license/zojize/nuxt-discord?style=flat&colorA=18181B&colorB=28CF8D
[license-href]: https://github.com/zojize/nuxt-discord/blob/main/LICENSE

[nuxt-src]: https://img.shields.io/badge/Nuxt-18181B?logo=nuxt.js
[nuxt-href]: https://nuxt.com
