---
title: Subcommands
---

# Subcommands

Directory structure maps directly to Discord's subcommand hierarchy. No configuration needed — just create directories.

## Structure

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

## Parent Commands

Parent commands must exist as files alongside their directory. They typically have empty bodies:

```ts
// discord/commands/channel.ts

/** Channel management commands */
export default () => {}
```

## Subcommands

Subcommands are regular command files inside the parent's directory:

```ts
// discord/commands/channel/send.ts

/**
 * Send a message to the channel
 * @param text The message to send
 */
export default defineSlashCommand(async (text: string) => {
  const interaction = useInteraction()
  if (interaction?.channel) {
    await interaction.channel.send(text)
    return reply.ephemeral(`Sent: ${text}`)
  }
  return reply.ephemeral('Cannot send here')
})
```

## Subcommand Groups

A second level of nesting creates subcommand groups:

```ts
// discord/commands/channel/members.ts (group parent)

/** Member information commands */
export default () => {}
```

```ts
// discord/commands/channel/members/count.ts

/** Get the member count */
export default defineSlashCommand(async () => {
  const interaction = useInteraction()
  const count = interaction?.channel?.members?.size ?? 0
  return `${count} members`
})
```

## Nesting Limits

Discord supports a maximum of 2 levels of nesting:

- `/command` — top level
- `/command subcommand` — one level
- `/command group subcommand` — two levels (maximum)

Files nested deeper than 2 directories will be ignored with a warning.
