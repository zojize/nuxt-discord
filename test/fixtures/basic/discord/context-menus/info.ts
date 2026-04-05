export default defineUserContextMenu('User Info', async (interaction) => {
  await interaction.reply(interaction.targetUser.tag)
})
