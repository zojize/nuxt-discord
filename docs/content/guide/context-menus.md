---
title: Context Menus
---

# Context Menu Commands

Context menu commands appear when right-clicking users or messages in Discord. Define them in the `discord/context-menus/` directory.

## User Context Menu

Right-click a user → Apps → your command:

```ts
// discord/context-menus/userinfo.ts
import { MessageFlags } from 'discord.js'

export default defineUserContextMenu('User Info', async (interaction) => {
  const user = interaction.targetUser
  await interaction.reply({
    content: `**${user.displayName}** (ID: ${user.id})`,
    flags: MessageFlags.Ephemeral,
  })
})
```

## Message Context Menu

Right-click a message → Apps → your command:

```ts
// discord/context-menus/bookmark.ts
import { MessageFlags } from 'discord.js'

export default defineMessageContextMenu('Bookmark', async (interaction) => {
  const message = interaction.targetMessage
  await interaction.reply({
    content: `Bookmarked: ${message.url}`,
    flags: MessageFlags.Ephemeral,
  })
})
```

## Name Resolution

The context menu name is resolved in this order:

1. First argument to `defineUserContextMenu` / `defineMessageContextMenu`
2. `@name` JSDoc tag
3. Filename (without `.ts`)

```ts
// Name from first argument (recommended)
export default defineUserContextMenu('Get Info', async (i) => { /* ... */ })

// Name from JSDoc
/** @name Get Info */
export default defineUserContextMenu(async (i) => { /* ... */ })

// Name from filename: "get-info.ts" → "get-info"
export default defineUserContextMenu(async (i) => { /* ... */ })
```

## Using the Reply Composable

The `reply` composable works in context menus just like in slash commands:

```ts
// discord/context-menus/bookmark.ts
export default defineMessageContextMenu('Bookmark', (interaction) => {
  return reply.ephemeral(`Bookmarked: ${interaction.targetMessage.url}`)
})
```

```ts
// discord/context-menus/userinfo.ts
export default defineUserContextMenu('User Info', (interaction) => {
  const user = interaction.targetUser
  return reply.ephemeral(`**${user.displayName}** (ID: ${user.id})`)
})
```

## Registration

Context menu commands are registered alongside slash commands when you sync:

```bash
curl -X POST http://localhost:3000/api/discord/slash-command/register
```
