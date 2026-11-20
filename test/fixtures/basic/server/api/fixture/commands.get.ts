export default defineEventHandler(() => ({ commands: useDiscordClient().getSlashCommands() }))
