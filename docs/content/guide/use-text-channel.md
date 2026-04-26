---
title: useTextChannel
---

# useTextChannel

A composable wrapper over a Discord text channel. Exposes reactive properties (driven by Discord events) and a `send()` method for sending non-interaction channel messages.

## Basic usage

```ts
export default () => {
  const channel = useTextChannel()
  channel.send('Hello channel!')
  return reply('Sent!')
}
```

`useTextChannel()` with no args reads from the ambient channel context — the channel of the current slash command, context menu, or channel-bearing event listener (`messageCreate`, `typingStart`, `channelUpdate`, etc.).

## Resolving a specific channel

```ts
const announcements = useTextChannel(myChannelInstance)
// String IDs require client.channels.fetch — not yet implemented.
// Pass an instance for now: useTextChannel(client.channels.cache.get(id))
```

## Reactive properties

These refs auto-update when Discord fires the relevant events:

| Ref | Updated by |
| --- | --- |
| `channel.name` | `Events.ChannelUpdate` |
| `channel.topic` | `Events.ChannelUpdate` |
| `channel.nsfw` | `Events.ChannelUpdate` |
| `channel.parent` | `Events.ChannelUpdate` |
| `channel.members` | `GuildMemberAdd/Remove/Update` + `ChannelUpdate` (perm overrides) |
| `channel.lastMessage` | `Events.MessageCreate` |

```ts
import { watch } from 'vue'

export default () => {
  const ch = useTextChannel()
  watch(ch.name, (newName) => {
    console.log(`channel renamed to ${newName}`)
  })
  return reply(`Currently in #${ch.name.value}`)
}
```

## Static properties

`channel.id`, `channel.type`, `channel.guildId`, `channel.createdAt` — never change during the channel's life. `channel.raw` is the underlying discord.js Channel for escape-hatch usage.

## Sending messages

`channel.send(content, options?)` mirrors `reply`'s contract:

- Accepts `string` or `MaybeRef<string>` (auto-edits when the ref changes)
- Returns a handle: `{ message, edit, delete }`
- Supports `files` in the options object

```ts
const handle = channel.send('First message')
await handle.edit('Edited!')
await handle.delete()
```

Reactive content:

```ts
const status = ref('Loading...')
channel.send(status)
status.value = 'Done!' // message edits automatically
```

## Inside event listeners

```ts
// discord/listeners/messageCreate.ts
export default defineListener('messageCreate', (msg) => {
  if (msg.author.bot)
    return
  if (msg.content === '!ping') {
    const ch = useTextChannel() // uses msg.channel
    ch.send('Pong!')
  }
})
```

## Lifecycle and cleanup

The Discord event listeners registered by reactive refs are tied to the current Vue effect scope. In slash commands and context menus, that scope is disposed by the `interactionTimeout` (default: 15 minutes). In event listeners, it's disposed when the handler returns. This means `useTextChannel`'s overhead vanishes automatically — no manual cleanup needed.
