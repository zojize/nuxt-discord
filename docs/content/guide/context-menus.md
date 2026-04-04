---
title: Context Menus
---

# Context Menu Commands

Context menu commands appear when right-clicking users or messages in Discord. Define them in the `discord/context-menus/` directory.

## User Context Menu

Right-click a user → Apps → your command:

```ts
// discord/context-menus/User Info.user.ts
import { MessageFlags } from 'discord.js'

export default defineUserContextMenu(async (interaction) => {
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
// discord/context-menus/Bookmark.message.ts
import { MessageFlags } from 'discord.js'

export default defineMessageContextMenu(async (interaction) => {
  const message = interaction.targetMessage
  await interaction.reply({
    content: `Bookmarked: ${message.url}`,
    flags: MessageFlags.Ephemeral,
  })
})
```

## File Naming Convention

| File | Type | Discord UI |
| --- | --- | --- |
| `Name.user.ts` | User context menu | Right-click user → Apps → "Name" |
| `Name.message.ts` | Message context menu | Right-click message → Apps → "Name" |

The command name comes from the filename (without the `.user.ts` or `.message.ts` suffix). Spaces in filenames are supported — `User Info.user.ts` becomes "User Info".

## Registration

Context menu commands are registered alongside slash commands when you sync:

```bash
curl -X POST http://localhost:3000/api/discord/slash-command/register
```

Or via the "Sync to Discord" button on the web dashboard.

## Best Practices

Use `MessageFlags.Ephemeral` instead of the deprecated `ephemeral: true` option:

```ts
// ✅ Correct
await interaction.reply({
  content: 'Response',
  flags: MessageFlags.Ephemeral,
})

// ❌ Deprecated
await interaction.reply({
  content: 'Response',
  ephemeral: true,
})
```
