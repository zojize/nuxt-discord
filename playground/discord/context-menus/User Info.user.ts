import { MessageFlags } from 'discord.js'

export default defineUserContextMenu(async (interaction) => {
  const user = interaction.targetUser
  await interaction.reply({
    content: [
      `**${user.displayName}**`,
      `ID: ${user.id}`,
      `Bot: ${user.bot ? 'Yes' : 'No'}`,
      `Created: ${user.createdAt.toLocaleDateString()}`,
    ].join('\n'),
    flags: MessageFlags.Ephemeral,
  })
})
