---
title: Hooks
---

# Runtime Hooks

Nuxt Discord provides Nitro hooks for customizing bot behavior at runtime.

## Available Hooks

### `discord:client:config`

Called before the Discord client connects. Use this to set presence, activity, or other client options:

```ts
// server/plugins/discord.ts
export default defineNitroPlugin(async (nitro) => {
  nitro.hooks.hook('discord:client:config', (options) => {
    options.presence = {
      status: 'online',
      activities: [{
        name: 'Powered by Nuxt',
        type: 0, // Playing
      }],
    }
  })
})
```

### `discord:client:ready`

Fired when the bot has successfully connected to Discord:

```ts
nitro.hooks.hook('discord:client:ready', (client) => {
  console.log('Bot is online!')
  console.log(`Connected to ${client.internalClient?.guilds.cache.size} guilds`)
})
```

### `discord:client:error`

The built-in logger records the event type and available Discord or HTTP error codes. Custom server hooks receive the original error and interaction, which can include private command arguments, reply content and interaction tokens. Select the fields your own logger needs.

```ts
nitro.hooks.hook('discord:client:error', (error) => {
  switch (error.type) {
    case 'UnknownSlashCommandError':
      console.warn('Unknown command:', error.interaction.commandName)
      break
    case 'SlashCommandExecutionError':
      console.error('Command failed:', error.interaction.commandName)
      break
    case 'SlashCommandRegistrationError':
      console.error('Registration failed')
      break
    case 'MissingRequiredOptionError':
      console.warn('Missing option:', error.option)
      break
  }
})
```

### Interaction lifecycle

`discord:interaction:before` runs before middleware on slash commands and context menus. `discord:interaction:denied` includes the reason when middleware stops execution. `discord:interaction:after` receives `status` (`ok`, `denied`, or `error`) and optional `detail`. The activity log records the status and available error codes. Free-form error messages and denial reasons are available to the server hook. Dashboard simulations run command middleware in isolation and omit these live lifecycle notifications.

## Server-Side Client Access

Access the Discord client from any server route or plugin:

```ts
// server/api/bot-status.get.ts
export default defineEventHandler(() => {
  const client = useDiscordClient()
  return {
    ready: client.isReady(),
    guilds: client.internalClient?.guilds.cache.size ?? 0,
    commands: client.getSlashCommands().length,
  }
})
```

## Using `useInteraction`

Inside a command, access the raw Discord interaction:

```ts
export default defineSlashCommand(async (text: string) => {
  const interaction = useInteraction()

  if (interaction?.channel) {
    await interaction.channel.send(text)
    return reply.ephemeral(`Sent to ${interaction.channel.name}`)
  }

  return reply.ephemeral('No channel context')
})
```
