import { MessageFlags } from 'discord.js'

export default defineMessageContextMenu(async (interaction) => {
  const message = interaction.targetMessage
  await interaction.reply({
    content: `Bookmarked: ${message.url}`,
    flags: MessageFlags.Ephemeral,
  })
})
