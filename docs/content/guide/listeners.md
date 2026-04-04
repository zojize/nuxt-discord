---
title: Event Listeners
---

# Event Listeners

Listen to any Discord gateway event with file-based listeners in the `discord/listeners/` directory.

## Basic Listener

```ts
// discord/listeners/welcome.ts
export default defineListener('guildMemberAdd', (member) => {
  member.guild.systemChannel?.send(`Welcome ${member}!`)
})
```

## One-Time Listener

Use the `once` option for events that should only fire once:

```ts
// discord/listeners/ready.ts
export default defineListener('ready', (client) => {
  console.log(`Logged in as ${client.user.tag}`)
}, { once: true })
```

## Supported Events

All discord.js `ClientEvents` are supported. Common examples:

| Event | Args | Description |
| --- | --- | --- |
| `ready` | `(client)` | Bot connected and ready |
| `messageCreate` | `(message)` | New message received |
| `guildMemberAdd` | `(member)` | User joined a server |
| `guildMemberRemove` | `(member)` | User left a server |
| `interactionCreate` | `(interaction)` | Any interaction received |
| `messageReactionAdd` | `(reaction, user)` | Reaction added to message |

## Intents

Listeners require the appropriate gateway intents to be configured. For example, `messageCreate` needs `GuildMessages` (and `MessageContent` if you want to read message text):

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  discord: {
    client: {
      intents: ['Guilds', 'GuildMessages', 'MessageContent'],
    },
  },
})
```

`MessageContent` is a privileged intent — enable it in the [Discord Developer Portal](https://discord.com/developers/applications) under Bot → Privileged Gateway Intents.

## Error Handling

Listener errors are caught and logged automatically — a failing listener won't crash the bot.
